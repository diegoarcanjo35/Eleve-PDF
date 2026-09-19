import type { ExtractedDocument } from "./pdfExtractText";
import { INGESTION_CONTRACT_VERSION } from "@shared/intelligence/constants";
import type { IngestionPayloadV1 } from "@shared/intelligence/types";

const SESSIONS_ENDPOINT = "/api/intelligence/sessions";

export interface CreateSessionResult {
  sessionId: string;
  status: string;
  expiresAt: string;
}

export interface IngestResult {
  sessionId: string;
  status: string;
  pageCount: number;
  chunkCount: number;
  expiresAt: string;
  chunkingStrategyVersion: string;
}

/** Converte o resultado da extração local (Sprint 01A) no payload de fio
 * versionado — nunca carrega bounding box, PDF original ou nome de arquivo. */
export function toIngestionPayload(document: ExtractedDocument): IngestionPayloadV1 {
  return {
    contractVersion: INGESTION_CONTRACT_VERSION,
    pageCount: document.pageCount,
    pages: document.pages.map((page) => ({
      pageNumber: page.pageNumber,
      blocks: page.blocks.map((block) => ({ text: block.text })),
    })),
  };
}

export async function createIntelligenceSession(): Promise<CreateSessionResult> {
  const response = await fetch(SESSIONS_ENDPOINT, { method: "POST", credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Falha ao criar sessão temporária (status ${response.status}).`);
  }
  return (await response.json()) as CreateSessionResult;
}

async function ingestPayload(sessionId: string, payload: IngestionPayloadV1): Promise<IngestResult> {
  const response = await fetch(`${SESSIONS_ENDPOINT}/${sessionId}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Falha na ingestão (status ${response.status}).`);
  }
  return (await response.json()) as IngestResult;
}

/**
 * Fluxo completo desta sprint: cria a sessão temporária e envia o texto já
 * extraído/normalizado localmente (Sprint 01A) para chunking no backend. O
 * PDF original nunca é lido por esta função — só `ExtractedDocument`, que já
 * não contém bytes do arquivo.
 */
export async function ingestExtractedDocument(document: ExtractedDocument): Promise<IngestResult> {
  const session = await createIntelligenceSession();
  const payload = toIngestionPayload(document);
  return ingestPayload(session.sessionId, payload);
}
