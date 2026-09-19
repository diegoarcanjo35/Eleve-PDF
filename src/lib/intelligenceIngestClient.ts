import type { ExtractedDocument } from "./pdfExtractText";
import { INGESTION_CONTRACT_VERSION } from "@shared/intelligence/constants";
import type { IngestionPayloadV1 } from "@shared/intelligence/types";
import { authorizationHeader } from "./intelligenceAuth";

const SESSIONS_ENDPOINT = "/api/intelligence/sessions";

export interface CreateSessionResult {
  sessionId: string;
  /** Segredo de autorização (Sprint 01E.1) — retornado só nesta resposta,
   * nunca de novo. Mantido apenas em memória (variável local desta função),
   * nunca em localStorage/sessionStorage/URL/Analytics/log — ver
   * `ingestExtractedDocument`. */
  sessionCapability: string;
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

async function ingestPayload(sessionId: string, sessionCapability: string, payload: IngestionPayloadV1): Promise<IngestResult> {
  const response = await fetch(`${SESSIONS_ENDPOINT}/${sessionId}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authorizationHeader(sessionCapability) },
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
 *
 * AUTORIZAÇÃO (Sprint 01E.1A): a `sessionCapability` devolvida por
 * `createIntelligenceSession` nunca é persistida por esta função — só
 * repassada de volta ao chamador (Sprint 01F: `useIntelligenceSession`,
 * que a mantém em memória para as chamadas de retrieve/ask subsequentes,
 * nunca em localStorage/sessionStorage/URL). Se o backend responder sem
 * capability (contrato divergente), a ingestão é recusada aqui mesmo,
 * localmente — nunca prossegue usando só o `sessionId` como se isso
 * autorizasse a operação.
 */
export async function ingestExtractedDocument(
  document: ExtractedDocument,
): Promise<IngestResult & { sessionCapability: string }> {
  const session = await createIntelligenceSession();
  if (!session.sessionCapability) {
    throw new Error("Sessão criada sem capability de autorização — ingestão recusada por segurança.");
  }
  const payload = toIngestionPayload(document);
  const result = await ingestPayload(session.sessionId, session.sessionCapability, payload);
  return { ...result, sessionCapability: session.sessionCapability };
}
