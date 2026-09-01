/**
 * Fonte única de verdade da taxonomia de Analytics do ElevePDF — importado tanto
 * pelo cliente (`src/analytics/`) quanto pelo backend (`functions/`), para que os
 * dois lados nunca divirjam sobre o que é um evento/valor válido. Só tipos e
 * listas fechadas — nenhuma lógica de rede, nenhum acesso a `window`/`document`
 * aqui, para que este arquivo seja seguro de importar em qualquer runtime
 * (navegador, Cloudflare Pages Functions/Workers, Node em testes).
 */

export const ALLOWED_EVENTS = [
  "page_view",
  "tool_open",
  "file_validation_success",
  "file_validation_error",
  "processing_start",
  "processing_success",
  "processing_error",
  "download_result",
  "structural_warning_shown",
  "structural_warning_confirmed",
  "no_gain_original_returned",
  "oversized_parts_result",
] as const;

export type AnalyticsEventType = (typeof ALLOWED_EVENTS)[number];

export function isAllowedEvent(value: unknown): value is AnalyticsEventType {
  return typeof value === "string" && (ALLOWED_EVENTS as readonly string[]).includes(value);
}

/** Identificadores de ferramenta — cresce junto com `toolsRegistry.ts`, mas é uma
 * lista própria e fechada (o backend não deve depender do registro de UI). */
export const ALLOWED_TOOL_IDS = ["compactar-pdf", "dividir-pdf-por-tamanho", "juntar-pdfs"] as const;
export type ToolId = (typeof ALLOWED_TOOL_IDS)[number];

export const ALLOWED_ROUTE_IDS = [
  "home",
  "compactar-pdf",
  "dividir-pdf-por-tamanho",
  "juntar-pdfs",
  "privacidade",
  "termos-de-uso",
] as const;
export type RouteId = (typeof ALLOWED_ROUTE_IDS)[number];

export const ALLOWED_CTA_IDS = [
  "hero_compactar",
  "hero_dividir",
  "card_compactar",
  "card_dividir",
  "card_juntar",
  "cross_link_compactar",
  "cross_link_dividir",
] as const;
export type CtaId = (typeof ALLOWED_CTA_IDS)[number];

export const ALLOWED_OUTCOMES = ["success", "error", "cancelled", "no_gain"] as const;
export type Outcome = (typeof ALLOWED_OUTCOMES)[number];

/** Categorias de erro — nunca a mensagem de erro real, só a categoria (`PdfErrorCode`
 * já é uma lista fechada em `src/lib/errors.ts`; esta lista é a versão pública/estável
 * exposta ao Analytics, para não acoplar o backend aos nomes internos do motor). */
export const ALLOWED_ERROR_CATEGORIES = [
  "not-a-pdf",
  "corrupted",
  "password-protected",
  "too-large",
  "too-many-pages",
  "out-of-memory",
  "processing-failed",
  "page-exceeds-limit",
  "unknown",
] as const;
export type ErrorCategory = (typeof ALLOWED_ERROR_CATEGORIES)[number];

export const ALLOWED_COMPRESSION_LEVELS = ["leve", "equilibrada", "maxima"] as const;
export type AnalyticsCompressionLevel = (typeof ALLOWED_COMPRESSION_LEVELS)[number];

/** Faixas, nunca valores exatos — quantidade de partes de uma divisão. */
export const ALLOWED_PARTS_BUCKETS = ["1", "2-5", "6-20", "21+"] as const;
export type PartsBucket = (typeof ALLOWED_PARTS_BUCKETS)[number];

/** Faixas de quantas partes ficaram acima do limite pedido. */
export const ALLOWED_OVERSIZED_PARTS_BUCKETS = ["0", "1", "2-5", "6+"] as const;
export type OversizedPartsBucket = (typeof ALLOWED_OVERSIZED_PARTS_BUCKETS)[number];

/** Faixas de duração de processamento, nunca milissegundos exatos. */
export const ALLOWED_DURATION_BUCKETS = ["<1s", "1-3s", "3-10s", "10-30s", "30s+"] as const;
export type DurationBucket = (typeof ALLOWED_DURATION_BUCKETS)[number];

export function durationMsToBucket(durationMs: number): DurationBucket {
  if (durationMs < 1000) return "<1s";
  if (durationMs < 3000) return "1-3s";
  if (durationMs < 10000) return "3-10s";
  if (durationMs < 30000) return "10-30s";
  return "30s+";
}

export function partsCountToBucket(count: number): PartsBucket {
  if (count <= 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  return "21+";
}

export function oversizedCountToBucket(count: number): OversizedPartsBucket {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  return "6+";
}

/**
 * Corpo aceito pelo endpoint de evento. Todo campo é opcional exceto `event`;
 * o servidor descarta qualquer propriedade fora desta lista (nunca aceita
 * propriedades arbitrárias — ver `validateEventPayload` em `validate.ts`).
 *
 * Não existe `occurred_at` neste contrato: o horário do evento é sempre
 * definido pelo servidor no momento do recebimento (ver
 * `functions/api/analytics/event.ts`), nunca pelo cliente — o navegador não
 * tem como ser uma fonte confiável de horário para persistência.
 */
export interface AnalyticsEventPayload {
  event: AnalyticsEventType;
  session_id: string;
  route_id?: RouteId;
  tool_id?: ToolId;
  cta_id?: CtaId;
  outcome?: Outcome;
  error_category?: ErrorCategory;
  compression_level?: AnalyticsCompressionLevel;
  parts_bucket?: PartsBucket;
  oversized_parts_bucket?: OversizedPartsBucket;
  duration_bucket?: DurationBucket;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_host?: string;
  landing_page?: RouteId;
}
