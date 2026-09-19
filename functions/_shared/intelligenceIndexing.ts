import { EMBEDDING_BATCH_SIZE, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../../shared/intelligence/constants";
import type { DocumentChunk } from "../../shared/intelligence/types";

/** ID determinístico e estável do vetor — o mesmo esquema já usado como
 * chave primária de `intelligence_chunks` (`${sessionId}:${chunkIndex}`).
 * Nunca é o texto do chunk, nunca depende de nome de arquivo ou de qualquer
 * dado pessoal. Permite ir resultado Vectorize -> chunk -> sessão sem
 * indireção extra: basta reconsultar o D1 por esta mesma chave. */
export function buildVectorId(sessionId: string, chunkIndex: number): string {
  return `${sessionId}:${chunkIndex}`;
}

function chunkIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize));
  }
  return batches;
}

interface EmbeddingLikeOutput {
  data?: unknown;
}

function isEmbeddingBatch(output: unknown, expectedCount: number): output is { data: number[][] } {
  if (typeof output !== "object" || output === null) return false;
  const data = (output as EmbeddingLikeOutput).data;
  if (!Array.isArray(data) || data.length !== expectedCount) return false;
  return data.every(
    (row) =>
      Array.isArray(row) && row.length === EMBEDDING_DIMENSIONS && row.every((n) => typeof n === "number"),
  );
}

export interface EmbedTextsResult {
  vectors: number[][];
  batches: number;
}

/**
 * Gera embeddings para uma lista de textos via Workers AI (`@cf/baai/bge-m3`
 * exclusivamente), em lotes de tamanho `EMBEDDING_BATCH_SIZE` — uma chamada
 * por lote, usando o batching nativo do modelo (`text: string[]`), nunca
 * uma chamada por texto. Nunca loga o conteúdo dos textos. Lança se a
 * resposta do modelo não tiver o formato esperado (`data: number[][]`, cada
 * vetor com `EMBEDDING_DIMENSIONS` números) ou se a contagem não bater com
 * o lote enviado — nunca aceita silenciosamente uma resposta inesperada.
 */
export async function embedTexts(ai: Ai, texts: string[]): Promise<EmbedTextsResult> {
  if (texts.length === 0) return { vectors: [], batches: 0 };

  const batches = chunkIntoBatches(texts, EMBEDDING_BATCH_SIZE);
  const vectors: number[][] = [];

  for (const batch of batches) {
    const output = await ai.run(EMBEDDING_MODEL, { text: batch, truncate_inputs: false });
    if (!isEmbeddingBatch(output, batch.length)) {
      throw new Error("Resposta inesperada do modelo de embeddings (formato ou contagem divergente).");
    }
    vectors.push(...output.data);
  }

  return { vectors, batches: batches.length };
}

export interface UpsertChunkVectorsResult {
  mutationId: string;
  vectorCount: number;
}

/**
 * Faz upsert de um vetor por chunk no Vectorize, com metadata mínima
 * suficiente para isolamento/recuperação (nunca o texto do chunk — o D1
 * continua sendo a fonte do texto/proveniência estruturada). `upsert()` é
 * assíncrono na API atual do Vectorize (retorna só um `mutationId` — não há
 * confirmação síncrona de que os vetores já estão indexados/consultáveis).
 */
export async function upsertChunkVectors(
  vectorize: Vectorize,
  sessionId: string,
  chunks: DocumentChunk[],
  embeddings: number[][],
  embeddingStrategyVersion: string,
): Promise<UpsertChunkVectorsResult> {
  if (chunks.length !== embeddings.length) {
    throw new Error("Quantidade de chunks e de embeddings não corresponde.");
  }
  if (chunks.length === 0) {
    return { mutationId: "", vectorCount: 0 };
  }

  const vectors: VectorizeVector[] = chunks.map((chunk, i) => ({
    id: buildVectorId(sessionId, chunk.index),
    values: embeddings[i]!,
    metadata: {
      sessionId,
      chunkId: buildVectorId(sessionId, chunk.index),
      startPage: chunk.startPage,
      endPage: chunk.endPage,
      chunkingStrategyVersion: chunk.chunkingStrategyVersion,
      embeddingStrategyVersion,
    },
  }));

  const result = await vectorize.upsert(vectors);
  return { mutationId: result.mutationId, vectorCount: vectors.length };
}
