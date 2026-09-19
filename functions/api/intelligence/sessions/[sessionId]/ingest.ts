import {
  MAX_INGEST_BODY_BYTES,
  CHUNKING_STRATEGY_VERSION,
  EMBEDDING_MODEL,
  EMBEDDING_STRATEGY_VERSION,
} from "../../../../../shared/intelligence/constants";
import { validateIngestionPayload } from "../../../../../shared/intelligence/validate";
import { chunkDocument } from "../../../../../shared/intelligence/chunking";
import { isAllowedRequestOrigin } from "../../../../_shared/origin";
import { isRateLimited } from "../../../../_shared/rateLimit";
import {
  claimSessionForIngest,
  getSession,
  insertChunks,
  markSessionFailed,
  markSessionIndexing,
  markSessionReady,
  releaseSessionClaim,
  type IntelligenceD1,
} from "../../../../_shared/intelligenceDb";
import { embedTexts, upsertChunkVectors } from "../../../../_shared/intelligenceIndexing";
import { logIntelligenceTelemetry } from "../../../../_shared/intelligenceTelemetry";
import { isExpired } from "../../../../_shared/intelligenceSession";

interface Env {
  INTEL_DB: IntelligenceD1;
  AI: Ai;
  VECTORIZE: Vectorize;
  // Ver comentário equivalente em ../../sessions.ts.
  ANALYTICS_ALLOW_LOCAL_DEV?: string;
  ANALYTICS_ALLOW_PAGES_PREVIEW?: string;
}

function genericError(status: number): Response {
  return new Response(null, { status });
}

/**
 * POST /api/intelligence/sessions/:sessionId/ingest — recebe o texto
 * estruturado por página (nunca o PDF, nunca o nome do arquivo), valida tudo
 * no backend, executa o chunking e persiste os chunks com proveniência de
 * página. Nunca ecoa o conteúdo do documento na resposta.
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
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_INGEST_BODY_BYTES) {
    return genericError(413);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_INGEST_BODY_BYTES) {
    return genericError(413);
  }

  const rateLimitKey = `intel-ingest:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`;
  if (isRateLimited(rateLimitKey)) {
    return genericError(429);
  }

  let session;
  try {
    session = await getSession(env.INTEL_DB, sessionId);
  } catch {
    return genericError(500);
  }
  if (!session) return genericError(404);

  const nowMs = Date.now();
  if (isExpired(new Date(session.expires_at).getTime(), nowMs)) {
    return genericError(410);
  }

  let claimed: boolean;
  try {
    claimed = await claimSessionForIngest(env.INTEL_DB, sessionId, new Date(nowMs).toISOString());
  } catch {
    return genericError(500);
  }
  if (!claimed) {
    // Sessão já não está em `created`: ingestão em andamento, já concluída,
    // ou já falhou — nunca reprocessa o mesmo documento silenciosamente.
    return genericError(409);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    // Corpo inválido nunca é registrado em log — só um 400 genérico. Libera
    // a sessão para permitir retry determinístico com um payload corrigido.
    await releaseSessionClaim(env.INTEL_DB, sessionId).catch(() => {});
    return genericError(400);
  }

  const payload = validateIngestionPayload(parsedBody);
  if (!payload) {
    await releaseSessionClaim(env.INTEL_DB, sessionId).catch(() => {});
    return genericError(400);
  }

  const indexingStartedAt = Date.now();
  try {
    const chunks = chunkDocument(payload.pages);
    await insertChunks(env.INTEL_DB, sessionId, chunks);

    // Só avança para indexação semântica depois de chunks persistidos. Uma
    // sessão nunca chega a `ready` sem essa transição explícita — impede
    // que uma falha de embedding/Vectorize deixe `ready` falsamente
    // alcançado (ver máquina de estados em intelligenceDb.ts).
    const enteredIndexing = await markSessionIndexing(env.INTEL_DB, sessionId);
    if (!enteredIndexing) {
      throw new Error("Não foi possível transicionar a sessão para indexing.");
    }

    const { vectors, batches } = await embedTexts(
      env.AI,
      chunks.map((c) => c.text),
    );
    if (vectors.length !== chunks.length) {
      throw new Error("Quantidade de embeddings não corresponde à quantidade de chunks.");
    }

    const { vectorCount } = await upsertChunkVectors(
      env.VECTORIZE,
      sessionId,
      chunks,
      vectors,
      EMBEDDING_STRATEGY_VERSION,
    );

    logIntelligenceTelemetry({
      operation: "embed_and_index",
      model: EMBEDDING_MODEL,
      provider: "workers-ai",
      inputCount: chunks.length,
      chunkCount: chunks.length,
      batchCount: batches,
      durationMs: Date.now() - indexingStartedAt,
      success: true,
    });

    const readyAtIso = new Date().toISOString();
    await markSessionReady(env.INTEL_DB, sessionId, {
      pageCount: payload.pageCount,
      chunkCount: chunks.length,
      strategyVersion: CHUNKING_STRATEGY_VERSION,
      vectorCount,
      embeddingStrategyVersion: EMBEDDING_STRATEGY_VERSION,
      readyAtIso,
    });

    return new Response(
      JSON.stringify({
        sessionId,
        status: "ready",
        pageCount: payload.pageCount,
        chunkCount: chunks.length,
        vectorCount,
        expiresAt: session.expires_at,
        chunkingStrategyVersion: CHUNKING_STRATEGY_VERSION,
        embeddingStrategyVersion: EMBEDDING_STRATEGY_VERSION,
      }),
      { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch {
    // Falha de chunking/embedding/upsert nunca deixa a sessão falsamente
    // `ready` — transição para o estado terminal `failed`. Débito técnico
    // deliberado (ver relatório Sprint 01C): se o upsert já tiver inserido
    // parte dos vetores antes de uma falha posterior, esses vetores ficam
    // órfãos no Vectorize (nenhuma limpeza automática nesta sprint) — mas
    // como a sessão nunca chega a `ready`, o endpoint de retrieval nunca a
    // torna alcançável, então isso nunca vira um vazamento entre sessões.
    logIntelligenceTelemetry({
      operation: "embed_and_index",
      model: EMBEDDING_MODEL,
      provider: "workers-ai",
      inputCount: 0,
      durationMs: Date.now() - indexingStartedAt,
      success: false,
    });
    await markSessionFailed(env.INTEL_DB, sessionId).catch(() => {});
    return genericError(500);
  }
};
