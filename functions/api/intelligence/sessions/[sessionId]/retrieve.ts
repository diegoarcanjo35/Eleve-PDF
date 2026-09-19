import {
  EMBEDDING_MODEL,
  MAX_RETRIEVE_BODY_BYTES,
  RETRIEVAL_EMPTY_RETRY_DELAY_MS,
  RETRIEVAL_TOP_K,
  VECTORIZE_PROPAGATION_GRACE_MS,
} from "../../../../../shared/intelligence/constants";
import { validateRetrievalQuery } from "../../../../../shared/intelligence/validate";
import type { RetrievedChunk } from "../../../../../shared/intelligence/types";
import { isAllowedRequestOrigin } from "../../../../_shared/origin";
import { isRateLimited } from "../../../../_shared/rateLimit";
import { getChunksByIds, getSession, type IntelligenceD1 } from "../../../../_shared/intelligenceDb";
import { embedTexts } from "../../../../_shared/intelligenceIndexing";
import { logIntelligenceTelemetry } from "../../../../_shared/intelligenceTelemetry";
import { isExpired } from "../../../../_shared/intelligenceSession";

interface Env {
  INTEL_DB: IntelligenceD1;
  AI: Ai;
  VECTORIZE: Vectorize;
  // Ver comentário equivalente em ../sessions.ts.
  ANALYTICS_ALLOW_LOCAL_DEV?: string;
  ANALYTICS_ALLOW_PAGES_PREVIEW?: string;
}

function genericError(status: number): Response {
  return new Response(null, { status });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryChunks(
  env: Env,
  sessionId: string,
  queryVector: number[],
): Promise<RetrievedChunk[]> {
  // Filtro de sessão aplicado NA própria query do Vectorize — nunca um
  // retrieval global seguido de filtragem local.
  const matches = await env.VECTORIZE.query(queryVector, {
    topK: RETRIEVAL_TOP_K,
    returnValues: false,
    returnMetadata: "none",
    filter: { sessionId: { $eq: sessionId } },
  });

  const chunkIds = matches.matches.map((m) => m.id);
  const chunkRows = await getChunksByIds(env.INTEL_DB, chunkIds);
  const chunksById = new Map(chunkRows.map((row) => [row.id, row]));

  const results: RetrievedChunk[] = [];
  for (const match of matches.matches) {
    const chunk = chunksById.get(match.id);
    if (!chunk) continue; // defensivo: nunca deveria faltar para uma sessão `ready`.
    results.push({
      chunkId: chunk.id,
      text: chunk.text,
      score: match.score,
      pages: JSON.parse(chunk.pages_json) as number[],
      startPage: chunk.start_page,
      endPage: chunk.end_page,
    });
  }
  return results;
}

/**
 * POST /api/intelligence/sessions/:sessionId/retrieve — busca semântica
 * restrita à sessão autorizada. Sem LLM, sem geração de resposta: só prova
 * que uma pergunta recupera os trechos corretos do documento correto.
 *
 * INVARIANTE DE SEGURANÇA (gate): a autorização (sessão existe, não
 * expirou, está `ready`) é verificada ANTES de qualquer embedding ou
 * consulta ao Vectorize — nunca "busca global, filtra depois". O filtro
 * `sessionId` é passado na própria chamada `query()` do Vectorize, então
 * nenhum vetor de outra sessão jamais entra no conjunto de resultados.
 *
 * CONSISTÊNCIA EVENTUAL (Sprint 01C.1): `upsert()` do Vectorize é assíncrono
 * — `ready` significa "upsert aceito", nunca "vetores garantidamente
 * consultáveis" (medido empiricamente: ainda invisível ~8s depois, visível
 * ~23s depois, numa única amostra real — não um SLA documentado). Por isso,
 * quando a primeira consulta não retorna nenhum resultado, este endpoint
 * faz UMA única reconsulta curta (nunca um loop de polling) antes de
 * responder. Se ainda vazio E a sessão ficou `ready` há menos de
 * `VECTORIZE_PROPAGATION_GRACE_MS`, o resultado vem marcado
 * `indexStatus: "possibly_propagating"` — nunca falsa certeza de "documento
 * sem conteúdo relevante". Fora dessa janela, vazio é tratado como
 * resultado genuíno (`indexStatus: "settled"`).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  if (!sessionId) return genericError(404);

  const allowLocalDev = env.ANALYTICS_ALLOW_LOCAL_DEV === "true";
  const allowPagesPreview = env.ANALYTICS_ALLOW_PAGES_PREVIEW === "true";
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (!isAllowedRequestOrigin(origin, host, { allowLocalDev, allowPagesPreview })) {
    return genericError(403);
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return genericError(415);
  }

  const contentLengthHeader = request.headers.get("Content-Length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_RETRIEVE_BODY_BYTES) {
    return genericError(413);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_RETRIEVE_BODY_BYTES) {
    return genericError(413);
  }

  const rateLimitKey = `intel-retrieve:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`;
  if (isRateLimited(rateLimitKey)) {
    return genericError(429);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return genericError(400);
  }

  const query = validateRetrievalQuery(parsedBody);
  if (!query) return genericError(400);

  // 1. Sessão existe? 2. Não expirou? 3. Estado adequado (`ready`)? — só
  // depois disso o escopo de retrieval é construído e o Vectorize é
  // consultado. Nenhum desses três "nãos" chega perto de gerar embedding
  // ou de tocar o Vectorize.
  let session;
  try {
    session = await getSession(env.INTEL_DB, sessionId);
  } catch {
    return genericError(500);
  }
  if (!session) return genericError(404);

  if (isExpired(new Date(session.expires_at).getTime())) {
    return genericError(410);
  }

  if (session.status !== "ready") {
    return genericError(409);
  }

  const retrievalStartedAt = Date.now();
  try {
    const { vectors } = await embedTexts(env.AI, [query.query]);
    if (vectors.length !== 1) {
      throw new Error("Falha ao gerar embedding da pergunta.");
    }

    let results = await queryChunks(env, sessionId, vectors[0]!);

    // Consistência eventual: Vectorize pode ainda não ter propagado o
    // upsert. Uma única reconsulta curta (nunca polling) quando o primeiro
    // resultado vem vazio — ver docstring acima.
    let indexStatus: "settled" | "possibly_propagating" = "settled";
    if (results.length === 0) {
      await sleep(RETRIEVAL_EMPTY_RETRY_DELAY_MS);
      results = await queryChunks(env, sessionId, vectors[0]!);

      if (results.length === 0) {
        const readyAtMs = session.ready_at ? new Date(session.ready_at).getTime() : null;
        const withinGraceWindow = readyAtMs !== null && Date.now() - readyAtMs < VECTORIZE_PROPAGATION_GRACE_MS;
        if (withinGraceWindow) indexStatus = "possibly_propagating";
      }
    }

    logIntelligenceTelemetry({
      operation: "retrieve",
      model: EMBEDDING_MODEL,
      provider: "workers-ai",
      inputCount: 1,
      durationMs: Date.now() - retrievalStartedAt,
      success: true,
    });

    return new Response(JSON.stringify({ sessionId, results, indexStatus }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    logIntelligenceTelemetry({
      operation: "retrieve",
      model: EMBEDDING_MODEL,
      provider: "workers-ai",
      inputCount: 1,
      durationMs: Date.now() - retrievalStartedAt,
      success: false,
    });
    return genericError(500);
  }
};
