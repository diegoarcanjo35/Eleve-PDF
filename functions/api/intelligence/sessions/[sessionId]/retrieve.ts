import {
  EMBEDDING_MODEL,
  MAX_RETRIEVE_BODY_BYTES,
  RATE_LIMIT_RETRIEVE_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "../../../../../shared/intelligence/constants";
import { validateRetrievalQuery } from "../../../../../shared/intelligence/validate";
import { isAllowedRequestOrigin } from "../../../../_shared/origin";
import { isRateLimited } from "../../../../_shared/rateLimit";
import { enforceDistributedRateLimit } from "../../../../_shared/distributedRateLimit";
import { verifySessionCapability } from "../../../../_shared/sessionCapability";
import { getSession, type IntelligenceD1 } from "../../../../_shared/intelligenceDb";
import { retrieveChunks } from "../../../../_shared/intelligenceRetrieval";
import { logIntelligenceError, logIntelligenceTelemetry } from "../../../../_shared/intelligenceTelemetry";
import { checkIntelAccess, type IntelAccessEnv } from "../../../../_shared/pilotAccess";
import { isExpired } from "../../../../_shared/intelligenceSession";
import { isEleveIaEnabled, type EleveIaFlagEnv } from "../../../../_shared/featureFlags";

interface Env extends EleveIaFlagEnv, IntelAccessEnv {
  INTEL_DB: IntelligenceD1;
  AI: Ai;
  VECTORIZE: Vectorize;
  // Ver comentário equivalente em ../../sessions.ts.
  RATE_LIMIT_HMAC_KEY?: string;
  ANALYTICS_ALLOW_LOCAL_DEV?: string;
  ANALYTICS_ALLOW_PAGES_PREVIEW?: string;
}

function genericError(status: number): Response {
  logIntelligenceError({ route: "retrieve", status });
  return new Response(null, { status });
}

/** Ver comentário equivalente em ../../sessions.ts sobre a mesma função em
 * ./ingest.ts — resposta genérica reaproveitada para sessão inexistente e
 * para capability ausente/incorreta, de propósito. */
function unauthorizedError(): Response {
  return genericError(401);
}

/**
 * POST /api/intelligence/sessions/:sessionId/retrieve — busca semântica
 * restrita à sessão autorizada. Sem LLM, sem geração de resposta: só prova
 * que uma pergunta recupera os trechos corretos do documento correto.
 *
 * A lógica real de embedding + query + retry + consistência eventual vive
 * em `functions/_shared/intelligenceRetrieval.ts` — reaproveitada também
 * por `/ask` (Sprint 01D), nunca reimplementada aqui.
 *
 * AUTORIZAÇÃO (Sprint 01E.1): mesma regra de `ingest.ts` — capability
 * validada ANTES de qualquer rate limit ou embedding/Vectorize usar a
 * sessão como identidade confiável.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  // Feature flag (Sprint 01H) — primeiríssima checagem, antes de qualquer
  // outra coisa. Ver `_shared/featureFlags.ts`.
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
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_RETRIEVE_BODY_BYTES) {
    return genericError(413);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_RETRIEVE_BODY_BYTES) {
    return genericError(413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return genericError(400);
  }

  const query = validateRetrievalQuery(parsedBody);
  if (!query) return genericError(400);

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
  const rateLimitKey = `intel-retrieve:${ip}`;
  if (isRateLimited(rateLimitKey)) {
    return genericError(429);
  }

  // Barreira autoritativa e distribuída (D1) — fail-closed nesta primeira
  // vertical, igual a ingest/ask: qualquer falha bloqueia, nunca segue para
  // embedding/Vectorize sem confirmação do limite.
  const distributed = await enforceDistributedRateLimit(
    env.INTEL_DB,
    env.RATE_LIMIT_HMAC_KEY,
    { operation: "retrieve", ip, sessionId },
    { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: RATE_LIMIT_RETRIEVE_MAX },
  );
  if (distributed === "blocked") return genericError(429);
  if (distributed === "error") return genericError(503);

  // 1. Sessão existe? 2. Não expirou? 3. Estado adequado (`ready`)? — só
  // depois disso o escopo de retrieval é construído e o Vectorize é
  // consultado. Nenhum desses três "nãos" chega perto de gerar embedding
  // ou de tocar o Vectorize.
  if (isExpired(new Date(session.expires_at).getTime())) {
    return genericError(410);
  }

  if (session.status !== "ready") {
    return genericError(409);
  }

  const retrievalStartedAt = Date.now();
  try {
    const { results, indexStatus } = await retrieveChunks(env, sessionId, query.query, session.ready_at);

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
