import { EMBEDDING_MODEL, MAX_RETRIEVE_BODY_BYTES } from "../../../../../shared/intelligence/constants";
import { validateRetrievalQuery } from "../../../../../shared/intelligence/validate";
import { isAllowedRequestOrigin } from "../../../../_shared/origin";
import { isRateLimited } from "../../../../_shared/rateLimit";
import { getSession, type IntelligenceD1 } from "../../../../_shared/intelligenceDb";
import { retrieveChunks } from "../../../../_shared/intelligenceRetrieval";
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

/**
 * POST /api/intelligence/sessions/:sessionId/retrieve — busca semântica
 * restrita à sessão autorizada. Sem LLM, sem geração de resposta: só prova
 * que uma pergunta recupera os trechos corretos do documento correto.
 *
 * A lógica real de embedding + query + retry + consistência eventual vive
 * em `functions/_shared/intelligenceRetrieval.ts` — reaproveitada também
 * por `/ask` (Sprint 01D), nunca reimplementada aqui.
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
