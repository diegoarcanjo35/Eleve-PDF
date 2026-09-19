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
