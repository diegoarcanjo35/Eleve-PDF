import {
  EMBEDDING_MODEL,
  MAX_RETRIEVE_BODY_BYTES,
  RETRIEVAL_TOP_K,
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

    // Filtro de sessão aplicado NA própria query do Vectorize — nunca um
    // retrieval global seguido de filtragem local.
    const matches = await env.VECTORIZE.query(vectors[0]!, {
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

    logIntelligenceTelemetry({
      operation: "retrieve",
      model: EMBEDDING_MODEL,
      provider: "workers-ai",
      inputCount: 1,
      durationMs: Date.now() - retrievalStartedAt,
      success: true,
    });

    return new Response(JSON.stringify({ sessionId, results }), {
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
