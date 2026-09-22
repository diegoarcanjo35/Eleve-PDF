import {
  LUNA_MODEL,
  LUNA_STRATEGY_VERSION,
  MAX_ASK_BODY_BYTES,
  MAX_CONTEXT_CHARS_TOTAL,
  MAX_CONTEXT_CHUNKS,
  RATE_LIMIT_ASK_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "../../../../../shared/intelligence/constants";
import { validateAskQuery } from "../../../../../shared/intelligence/validate";
import type { AskEvidence, RetrievedChunk } from "../../../../../shared/intelligence/types";
import { isAllowedRequestOrigin } from "../../../../_shared/origin";
import { isRateLimited } from "../../../../_shared/rateLimit";
import { enforceDistributedRateLimit } from "../../../../_shared/distributedRateLimit";
import { verifySessionCapability } from "../../../../_shared/sessionCapability";
import { getSession, type IntelligenceD1 } from "../../../../_shared/intelligenceDb";
import { retrieveChunks } from "../../../../_shared/intelligenceRetrieval";
import { askLuna } from "../../../../_shared/lunaClient";
import { resolveRelevantPage } from "../../../../_shared/relevantPageResolver";
import { logIntelligenceError, logIntelligenceOutcome, logIntelligenceTelemetry } from "../../../../_shared/intelligenceTelemetry";
import { checkIntelAccess, type IntelAccessEnv } from "../../../../_shared/pilotAccess";
import { isExpired } from "../../../../_shared/intelligenceSession";
import { isEleveIaEnabled, type EleveIaFlagEnv } from "../../../../_shared/featureFlags";

interface Env extends EleveIaFlagEnv, IntelAccessEnv {
  INTEL_DB: IntelligenceD1;
  AI: Ai;
  VECTORIZE: Vectorize;
  /** Só backend. Nunca no bundle do cliente, nunca em log, nunca ecoada em
   * erro. Ausente => 503 explícito, nunca chamada real tentada. */
  OPENAI_API_KEY?: string;
  // Ver comentário equivalente em ../../sessions.ts.
  RATE_LIMIT_HMAC_KEY?: string;
  ANALYTICS_ALLOW_LOCAL_DEV?: string;
  ANALYTICS_ALLOW_PAGES_PREVIEW?: string;
}

function genericError(status: number): Response {
  logIntelligenceError({ route: "ask", status });
  return new Response(null, { status });
}

/** Ver comentário equivalente em ./ingest.ts — resposta genérica
 * reaproveitada para sessão inexistente e para capability ausente/incorreta,
 * de propósito. */
function unauthorizedError(): Response {
  return genericError(401);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Trunca defensivamente por limites de contexto SERVER-SIDE — nunca
 * controlados pelo cliente. Já bem abaixo do teórico (MAX_CONTEXT_CHUNKS ×
 * CHUNK_MAX_CHARS) na prática, mas nunca depende só disso. */
function selectContextChunks(results: RetrievedChunk[]): RetrievedChunk[] {
  const capped = results.slice(0, MAX_CONTEXT_CHUNKS);
  const selected: RetrievedChunk[] = [];
  let aggregateChars = 0;
  for (const chunk of capped) {
    if (aggregateChars + chunk.text.length > MAX_CONTEXT_CHARS_TOTAL) break;
    selected.push(chunk);
    aggregateChars += chunk.text.length;
  }
  return selected;
}

/**
 * POST /api/intelligence/sessions/:sessionId/ask — primeira geração de
 * resposta fundamentada do Eleve PDF IA. Sem UI, sem histórico multi-turno.
 *
 * ORDEM DE SEGURANÇA OBRIGATÓRIA (nunca alterada, estendida na Sprint
 * 01E.1): validar requisição -> localizar sessão -> validar capability ->
 * rate limit (em memória, depois D1 autoritativo) -> verificar
 * expiração/estado -> verificar secret -> embedding da pergunta -> Vectorize
 * filtrado por sessionId -> chunks do D1 -> montar contexto SOMENTE com
 * chunks autorizados -> Luna -> validar evidências -> responder. O LLM nunca
 * decide quais documentos consultar (retrieval sempre vem antes, via
 * `intelligenceRetrieval.ts` — a MESMA lógica de `/retrieve`, nunca
 * reimplementada). Nenhum chunk de outra sessão chega perto do Luna: o
 * filtro `sessionId` é aplicado na própria query do Vectorize. Nenhuma
 * chamada a Workers AI/Vectorize/Luna ocorre antes da capability e do rate
 * limit distribuído (ver relatório de auditoria Sprint 01E, item 14).
 *
 * PROMPT INJECTION: o texto recuperado do PDF é DADO NÃO CONFIÁVEL — as
 * instruções de sistema enviadas ao Luna (`lunaClient.ts`) estabelecem essa
 * fronteira; nenhuma sanitização de conteúdo é feita aqui (o modelo aprende
 * pela hierarquia do prompt, nunca por remoção de texto).
 *
 * CONSISTÊNCIA EVENTUAL: se o retrieval vier `possibly_propagating`, o Luna
 * NUNCA é chamado (zero custo) — resposta transitória explícita para o
 * cliente tentar de novo.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  // Feature flag (Sprint 01H) — primeiríssima checagem, antes de qualquer
  // outra coisa (inclusive antes de gastar qualquer coisa com Luna). Ver
  // `_shared/featureFlags.ts`.
  if (!isEleveIaEnabled(env)) return genericError(404);

  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  if (!sessionId) return genericError(404);

  const allowLocalDev = env.ANALYTICS_ALLOW_LOCAL_DEV === "true";
  const allowPagesPreview = env.ANALYTICS_ALLOW_PAGES_PREVIEW === "true";
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (!isAllowedRequestOrigin(origin, host, { allowLocalDev, allowPagesPreview })) {
    return genericError(403);
  }

  // Segunda camada de acesso do piloto (Sprint 01P) — ver ../../sessions.ts.
  const access = await checkIntelAccess(request, env);
  if (!access.allowed) return genericError(401);

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return genericError(415);
  }

  const contentLengthHeader = request.headers.get("Content-Length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_ASK_BODY_BYTES) {
    return genericError(413);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_ASK_BODY_BYTES) {
    return genericError(413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return genericError(400);
  }

  const ask = validateAskQuery(parsedBody);
  if (!ask) return genericError(400);

  // Sessão localizada ANTES da capability poder ser verificada, e ambas
  // ANTES de qualquer rate limit que use `sessionId` como identidade.
  let session;
  try {
    session = await getSession(env.INTEL_DB, sessionId);
  } catch {
    return genericError(500);
  }
  if (!session) return unauthorizedError();

  const authorized = await verifySessionCapability(request.headers.get("Authorization"), session.capability_hash);
  if (!authorized) return unauthorizedError();

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // Barreira barata (em memória, best-effort) — nunca a única proteção.
  const rateLimitKey = `intel-ask:${ip}`;
  if (isRateLimited(rateLimitKey)) {
    return genericError(429);
  }

  // Barreira autoritativa e distribuída (D1), mais restritiva que
  // ingest/retrieve — maior custo real por chamada (Luna). Fail-closed
  // obrigatório: qualquer falha bloqueia, nunca segue para
  // embedding/Vectorize/Luna sem confirmação do limite.
  const distributed = await enforceDistributedRateLimit(
    env.INTEL_DB,
    env.RATE_LIMIT_HMAC_KEY,
    { operation: "ask", ip, sessionId },
    { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: RATE_LIMIT_ASK_MAX },
  );
  if (distributed === "blocked") return genericError(429);
  if (distributed === "error") return genericError(503);

  // Sessão existe? Não expirou? Estado adequado (`ready`)? Nenhum desses
  // "nãos" chega perto de embedding, Vectorize, ou Luna.
  if (isExpired(new Date(session.expires_at).getTime())) {
    return genericError(410);
  }

  if (session.status !== "ready") {
    return genericError(409);
  }

  // Verifica só a PRESENÇA do secret — nunca seu valor, nunca inventa uma
  // chave. Checado antes de qualquer chamada real (embedding/Vectorize
  // inclusive) para nunca gastar Workers AI numa requisição que já sabemos
  // que não pode terminar em geração.
  if (!env.OPENAI_API_KEY) {
    return genericError(503);
  }

  let outcome;
  try {
    outcome = await retrieveChunks(env, sessionId, ask.question, session.ready_at);
  } catch {
    return genericError(500);
  }

  if (outcome.indexStatus === "possibly_propagating") {
    // Nenhum custo de Luna aqui — nunca finge "sem informação relevante".
    logIntelligenceOutcome({ route: "ask", indexStatus: "possibly_propagating" });
    return json({ sessionId, status: "possibly_propagating" }, 202);
  }

  const contextChunks = selectContextChunks(outcome.results);

  if (contextChunks.length === 0) {
    // Política adotada nesta sprint: zero chunks recuperados (settled) nunca
    // chama o Luna — o resultado já é conhecido (nenhuma evidência
    // disponível), então gastar uma chamada paga seria desperdício de
    // custo previsível sem nenhum ganho de qualidade.
    logIntelligenceOutcome({ route: "ask", insufficientEvidence: true, indexStatus: "settled" });
    return json({
      sessionId,
      answer: null,
      insufficientEvidence: true,
      evidence: [],
      indexStatus: "settled",
    });
  }

  const evidenceMap = new Map<string, RetrievedChunk>();
  const evidences = contextChunks.map((chunk, i) => {
    const evidenceId = `E${i + 1}`;
    evidenceMap.set(evidenceId, chunk);
    return { id: evidenceId, text: chunk.text };
  });

  const askStartedAt = Date.now();
  try {
    const { answer, usage } = await askLuna(env.OPENAI_API_KEY, ask.question, evidences);

    // Validação server-side (nunca confia cegamente no modelo, mesmo com
    // Structured Outputs): todo evidenceId retornado precisa existir no
    // conjunto que foi realmente enviado — nunca um ID inventado, nunca uma
    // página aproximada/"consertada" a partir de um ID inválido.
    for (const evidenceId of answer.evidenceIds) {
      if (!evidenceMap.has(evidenceId)) {
        throw new Error("luna_unknown_evidence_id");
      }
    }

    const resolvedEvidence: AskEvidence[] = answer.evidenceIds.map((evidenceId) => {
      const chunk = evidenceMap.get(evidenceId)!;
      // `relevantPage` (Sprint 01L.1): resolvido inteiramente aqui, no
      // servidor, DEPOIS que o Luna já respondeu — nunca perguntado a ele
      // (ver `resolveRelevantPage`). `undefined` sempre que a confiança não
      // for suficiente; o cliente já sabe cair de volta para
      // startPage–endPage nesse caso, exatamente como antes desta sprint.
      const relevantPage = resolveRelevantPage({
        question: ask.question,
        answer: answer.answer,
        chunkText: chunk.text,
        pageSpans: chunk.pageSpans,
      });
      return {
        evidenceId,
        chunkId: chunk.chunkId,
        pages: chunk.pages,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        ...(relevantPage !== undefined ? { relevantPage } : {}),
      };
    });

    logIntelligenceTelemetry({
      operation: "ask",
      model: LUNA_MODEL,
      provider: "openai",
      inputCount: evidences.length,
      durationMs: Date.now() - askStartedAt,
      success: true,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      totalTokens: usage.totalTokens,
    });

    logIntelligenceOutcome({ route: "ask", insufficientEvidence: answer.insufficientEvidence, indexStatus: "settled" });
    return json({
      sessionId,
      answer: answer.answer,
      insufficientEvidence: answer.insufficientEvidence,
      evidence: resolvedEvidence,
      indexStatus: "settled",
      lunaStrategyVersion: LUNA_STRATEGY_VERSION,
    });
  } catch {
    logIntelligenceTelemetry({
      operation: "ask",
      model: LUNA_MODEL,
      provider: "openai",
      inputCount: evidences.length,
      durationMs: Date.now() - askStartedAt,
      success: false,
    });
    // Nunca expõe detalhes internos/provider — só um 502 genérico (falha do
    // provedor a jusante), nunca o corpo/erro real da OpenAI.
    return genericError(502);
  }
};
