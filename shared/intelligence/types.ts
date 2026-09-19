import type { INGESTION_CONTRACT_VERSION, RETRIEVAL_CONTRACT_VERSION } from "./constants";

/** Estado da sessão temporária, controlado exclusivamente pelo backend.
 * `indexing` (Sprint 01C) fica entre `ingesting` e `ready` — uma sessão só
 * chega a `ready` depois de chunks *e* vetores (embeddings no Vectorize)
 * existirem; nunca antes. */
export type SessionStatus = "created" | "ingesting" | "indexing" | "ready" | "failed";

/** Bloco de texto (linha/parágrafo) de uma página, já normalizado pela
 * extração local (Sprint 01A). Nunca carrega bounding box — coordenadas
 * detalhadas permanecem só no navegador (decisão fechada na Etapa 02). */
export interface IngestionBlockV1 {
  text: string;
}

export interface IngestionPageV1 {
  pageNumber: number;
  blocks: IngestionBlockV1[];
}

/** Payload versionado enviado por `POST /api/intelligence/sessions/:id/ingest`.
 * Nunca carrega o PDF original, nome de arquivo, ou qualquer metadado de
 * dispositivo — só o texto estruturado necessário à ingestão. */
export interface IngestionPayloadV1 {
  contractVersion: typeof INGESTION_CONTRACT_VERSION;
  pageCount: number;
  pages: IngestionPageV1[];
}

/** Chunk produzido pelo chunking backend, com proveniência determinística de
 * página — nunca fabricada depois do fato. */
export interface DocumentChunk {
  index: number;
  text: string;
  startPage: number;
  endPage: number;
  /** Páginas (ordenadas, únicas) que contribuíram texto para este chunk. */
  pages: number[];
  chunkingStrategyVersion: string;
}

/** Payload versionado enviado por `POST /api/intelligence/sessions/:id/retrieve`.
 * Nunca carrega namespace, filtro de sessão, topK, modelo ou índice — esses
 * controles são exclusivamente do servidor (ver `04-... retrieve.ts`). */
export interface RetrievalQueryV1 {
  contractVersion: typeof RETRIEVAL_CONTRACT_VERSION;
  query: string;
}

/** Um chunk recuperado, pronto para validação técnica — nunca inclui o
 * embedding, metadata interna, ou qualquer dado de outra sessão/documento. */
export interface RetrievedChunk {
  chunkId: string;
  text: string;
  score: number;
  pages: number[];
  startPage: number;
  endPage: number;
}
