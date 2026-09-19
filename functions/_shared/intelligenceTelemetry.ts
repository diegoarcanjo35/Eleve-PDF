/**
 * Telemetria técnica/econômica mínima da Inteligência Documental — primeira
 * operação real de IA do produto (Sprint 01C). Estrutura preparatória para
 * medir custo real no futuro; NÃO é um ledger de créditos, não define
 * preço, não persiste em nenhuma tabela nesta sprint (ver
 * `04-creditos-economia-ia.md`).
 *
 * INVARIANTE: nunca logar conteúdo — nenhum texto de chunk, nenhuma
 * pergunta do usuário, nenhum trecho de documento. Só contagens, durações,
 * identificadores técnicos e resultado sucesso/falha. A Workers AI, no
 * contrato atual de `@cf/baai/bge-m3`, não retorna `usage`/contagem de
 * tokens — por isso este evento nunca inclui custo ou tokens: inventar
 * esse número seria pior do que não tê-lo.
 */
export interface IntelligenceTelemetryEvent {
  operation: "embed_and_index" | "retrieve";
  model: string;
  provider: "workers-ai" | "vectorize";
  inputCount: number;
  chunkCount?: number;
  batchCount?: number;
  durationMs: number;
  success: boolean;
}

export function logIntelligenceTelemetry(event: IntelligenceTelemetryEvent): void {
  console.log(
    JSON.stringify({
      type: "intelligence_telemetry",
      ...event,
    }),
  );
}
