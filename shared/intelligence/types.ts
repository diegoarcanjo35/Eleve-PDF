import type { INGESTION_CONTRACT_VERSION } from "./constants";

/** Estado da sessão temporária, controlado exclusivamente pelo backend. */
export type SessionStatus = "created" | "ingesting" | "ready" | "failed";

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
