import { RETRIEVAL_CONTRACT_VERSION } from "@shared/intelligence/constants";
import type { RetrievedChunk } from "@shared/intelligence/types";
import { authorizationHeader } from "./intelligenceAuth";

const SESSIONS_ENDPOINT = "/api/intelligence/sessions";

export interface RetrieveResult {
  sessionId: string;
  results: RetrievedChunk[];
  indexStatus: "settled" | "possibly_propagating";
}

/**
 * `POST /api/intelligence/sessions/:sessionId/retrieve` — busca semântica
 * sem geração de resposta. Exige `Authorization: Bearer <sessionCapability>`
 * (Sprint 01E.1); nunca aceita operar só com `sessionId` (ver
 * `functions/api/intelligence/sessions/[sessionId]/retrieve.ts`).
 */
export async function retrieveChunks(
  sessionId: string,
  sessionCapability: string,
  query: string,
): Promise<RetrieveResult> {
  const response = await fetch(`${SESSIONS_ENDPOINT}/${sessionId}/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authorizationHeader(sessionCapability) },
    body: JSON.stringify({ contractVersion: RETRIEVAL_CONTRACT_VERSION, query }),
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Falha ao buscar trechos do documento (status ${response.status}).`);
  }
  return (await response.json()) as RetrieveResult;
}
