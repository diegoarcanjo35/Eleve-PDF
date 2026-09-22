import { ASK_CONTRACT_VERSION } from "@shared/intelligence/constants";
import type { AskEvidence } from "@shared/intelligence/types";
import { authorizationHeader } from "./intelligenceAuth";
import { IntelligenceHttpError } from "./intelligenceErrors";

const SESSIONS_ENDPOINT = "/api/intelligence/sessions";

export interface AskAnswer {
  sessionId: string;
  /** `null` quando `insufficientEvidence` é `true` e nenhum chunk relevante
   * foi recuperado — nunca tratar como resposta confirmada nesse caso. */
  answer: string | null;
  insufficientEvidence: boolean;
  /** Sempre vinda do backend (nunca inventada no cliente) — páginas reais,
   * resolvidas a partir do D1, nunca definidas pelo modelo. */
  evidence: AskEvidence[];
  indexStatus: "settled";
  lunaStrategyVersion?: string;
}

export interface AskPropagating {
  sessionId: string;
  status: "possibly_propagating";
}

export type AskResult = { kind: "answer"; data: AskAnswer } | { kind: "propagating"; data: AskPropagating };

/**
 * `POST /api/intelligence/sessions/:sessionId/ask` — geração fundamentada
 * (GPT-5.6 Luna, Sprint 01D). Exige `Authorization: Bearer <sessionCapability>`
 * (Sprint 01E.1); nunca aceita operar só com `sessionId`.
 *
 * `202 possibly_propagating`: o índice do documento ainda pode estar se
 * propagando (consistência eventual do Vectorize) — nenhum custo de Luna foi
 * gerado; o chamador decide se tenta de novo (nesta sprint, sem retry
 * automático — ver `useIntelligenceSession`).
 */
export async function askQuestion(
  sessionId: string,
  sessionCapability: string,
  question: string,
): Promise<AskResult> {
  const response = await fetch(`${SESSIONS_ENDPOINT}/${sessionId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authorizationHeader(sessionCapability) },
    body: JSON.stringify({ contractVersion: ASK_CONTRACT_VERSION, question }),
    credentials: "omit",
  });

  if (response.status === 202) {
    return { kind: "propagating", data: (await response.json()) as AskPropagating };
  }
  if (!response.ok) {
    throw new IntelligenceHttpError(response.status, `Falha ao perguntar à Eleve IA (status ${response.status}).`);
  }
  return { kind: "answer", data: (await response.json()) as AskAnswer };
}
