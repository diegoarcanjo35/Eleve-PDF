import { RETRIEVAL_EMPTY_RETRY_DELAY_MS, RETRIEVAL_TOP_K, VECTORIZE_PROPAGATION_GRACE_MS } from "../../shared/intelligence/constants";
import type { RetrievedChunk } from "../../shared/intelligence/types";
import { getChunksByIds, type IntelligenceD1 } from "./intelligenceDb";
import { embedTexts } from "./intelligenceIndexing";

export interface RetrievalEnv {
  INTEL_DB: IntelligenceD1;
  AI: Ai;
  VECTORIZE: Vectorize;
}

export interface RetrievalOutcome {
  results: RetrievedChunk[];
  indexStatus: "settled" | "possibly_propagating";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryChunksOnce(env: RetrievalEnv, sessionId: string, queryVector: number[]): Promise<RetrievedChunk[]> {
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
 * Núcleo de retrieval reaproveitado por `/retrieve` (Sprint 01C) e `/ask`
 * (Sprint 01D) — a MESMA lógica, nunca reimplementada. Embute:
 *
 * INVARIANTE DE SEGURANÇA: o filtro `sessionId` é passado na própria query
 * do Vectorize — nunca "busca global, filtra depois". Nenhum vetor de outra
 * sessão jamais entra no conjunto de resultados.
 *
 * CONSISTÊNCIA EVENTUAL (Sprint 01C.1): `upsert()` do Vectorize é
 * assíncrono — uma sessão `ready` não garante vetores já consultáveis.
 * Quando a primeira consulta vem vazia, faz UMA única reconsulta curta
 * (nunca um loop de polling). Se ainda vazia e a sessão ficou `ready` há
 * menos de `VECTORIZE_PROPAGATION_GRACE_MS`, `indexStatus` vem
 * `"possibly_propagating"` — nunca falsa certeza de "sem conteúdo
 * relevante". Fora dessa janela, vazio é tratado como resultado genuíno.
 */
export async function retrieveChunks(
  env: RetrievalEnv,
  sessionId: string,
  queryText: string,
  readyAt: string | null,
): Promise<RetrievalOutcome> {
  const { vectors } = await embedTexts(env.AI, [queryText]);
  if (vectors.length !== 1) {
    throw new Error("Falha ao gerar embedding da pergunta.");
  }

  let results = await queryChunksOnce(env, sessionId, vectors[0]!);
  let indexStatus: "settled" | "possibly_propagating" = "settled";

  if (results.length === 0) {
    await sleep(RETRIEVAL_EMPTY_RETRY_DELAY_MS);
    results = await queryChunksOnce(env, sessionId, vectors[0]!);

    if (results.length === 0) {
      const readyAtMs = readyAt ? new Date(readyAt).getTime() : null;
      const withinGraceWindow = readyAtMs !== null && Date.now() - readyAtMs < VECTORIZE_PROPAGATION_GRACE_MS;
      if (withinGraceWindow) indexStatus = "possibly_propagating";
    }
  }

  return { results, indexStatus };
}
