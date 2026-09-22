/**
 * Telemetria técnica/econômica mínima da Inteligência Documental — primeira
 * operação real de IA do produto (Sprint 01C). Estrutura preparatória para
 * medir custo real no futuro; NÃO é um ledger de créditos, não define
 * preço, não persiste em nenhuma tabela nesta sprint (ver
 * `04-creditos-economia-ia.md`).
 *
 * INVARIANTE: nunca logar conteúdo — nenhum texto de chunk, nenhuma
 * pergunta do usuário, nenhum trecho de documento, nenhuma resposta gerada.
 * Só contagens, durações, identificadores técnicos e resultado
 * sucesso/falha. A Workers AI, no contrato atual de `@cf/baai/bge-m3`, não
 * retorna `usage`/contagem de tokens — por isso os eventos de embedding
 * nunca incluem custo ou tokens: inventar esse número seria pior do que não
 * tê-lo. Já a OpenAI Responses API (`operation: "ask"`, Sprint 01D) retorna
 * `usage` real — os campos abaixo são capturados quando o contrato atual
 * fornecer, e ficam `null`/ausentes quando não fornecer, nunca estimados.
 */
export interface IntelligenceTelemetryEvent {
  operation: "embed_and_index" | "retrieve" | "ask";
  model: string;
  provider: "workers-ai" | "vectorize" | "openai";
  inputCount: number;
  chunkCount?: number;
  batchCount?: number;
  durationMs: number;
  success: boolean;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
}

export function logIntelligenceTelemetry(event: IntelligenceTelemetryEvent): void {
  console.log(
    JSON.stringify({
      type: "intelligence_telemetry",
      ...event,
    }),
  );
}

/**
 * Observabilidade operacional mínima do piloto (Sprint 01P) — separada da
 * telemetria de custo acima de propósito (concern diferente: aqui é "o que
 * aconteceu", não "quanto custou"). MESMA invariante de minimização de
 * dados: nunca pergunta, resposta, texto do PDF, capability, sessionId bruto
 * ou IP — só o `route`/`status`/categoria fechada, e os dois sinais
 * estruturais de resultado (`insufficientEvidence`, `indexStatus`).
 */
export type IntelligenceRoute = "sessions" | "ingest" | "retrieve" | "ask";

/** Categoria fechada por status HTTP — nunca inventa uma categoria nova
 * para um status desconhecido (cai em "internal", o mais conservador). */
export type IntelligenceErrorCategory =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "expired"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "provider_error"
  | "unavailable"
  | "internal";

const STATUS_TO_CATEGORY: Record<number, IntelligenceErrorCategory> = {
  400: "invalid_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  410: "expired",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "rate_limited",
  500: "internal",
  502: "provider_error",
  503: "unavailable",
};

export function categorizeIntelligenceErrorStatus(status: number): IntelligenceErrorCategory {
  return STATUS_TO_CATEGORY[status] ?? "internal";
}

export interface IntelligenceErrorEvent {
  route: IntelligenceRoute;
  status: number;
}

/** Chamado a partir de `genericError()` em cada um dos 4 endpoints — nunca
 * precisa ser chamado manualmente em cada call site (ver os 4 arquivos de
 * rota: a própria função local `genericError` já loga antes de responder). */
export function logIntelligenceError(event: IntelligenceErrorEvent): void {
  console.log(
    JSON.stringify({
      type: "intelligence_error",
      route: event.route,
      status: event.status,
      category: categorizeIntelligenceErrorStatus(event.status),
    }),
  );
}

export interface IntelligenceOutcomeEvent {
  route: IntelligenceRoute;
  /** Presente só na rota `ask` — nunca inventado para outras rotas. */
  insufficientEvidence?: boolean;
  /** Presente só na rota `ask` — reflete o `indexStatus` real da resposta
   * (nunca confundir com sucesso/erro: `possibly_propagating` é um 202
   * "sucesso técnico", não uma falha). */
  indexStatus?: "settled" | "possibly_propagating";
}

/** Log estrutural de desfecho — complementa `logIntelligenceError` (que só
 * cobre respostas de erro) com os dois sinais de sucesso "não-trivial" do
 * `/ask` que hoje não apareciam em lugar nenhum além do corpo HTTP
 * individual (ver auditoria da Sprint "Planejamento do Piloto"). */
export function logIntelligenceOutcome(event: IntelligenceOutcomeEvent): void {
  console.log(
    JSON.stringify({
      type: "intelligence_outcome",
      ...event,
    }),
  );
}
