import {
  ALLOWED_COMPRESSION_LEVELS,
  ALLOWED_CTA_IDS,
  ALLOWED_DURATION_BUCKETS,
  ALLOWED_ERROR_CATEGORIES,
  ALLOWED_OUTCOMES,
  ALLOWED_OVERSIZED_PARTS_BUCKETS,
  ALLOWED_PARTS_BUCKETS,
  ALLOWED_ROUTE_IDS,
  ALLOWED_TOOL_IDS,
  isAllowedEvent,
  type AnalyticsEventPayload,
} from "./events";
import { referrerToHostname, sanitizeUtmValue } from "./sanitize";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function inList<T extends string>(value: unknown, list: readonly T[]): T | undefined {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : undefined;
}

export type ValidatedAnalyticsEvent = AnalyticsEventPayload;

/**
 * Evento validado e já com `occurred_at` atribuído pelo servidor — o único
 * formato aceito para persistência no D1. É construído explicitamente pelo
 * endpoint (`functions/api/analytics/event.ts`) logo antes do INSERT, nunca
 * por este módulo e nunca a partir de um valor vindo do cliente: o horário é
 * sempre `new Date().toISOString()` calculado no momento do recebimento da
 * requisição no servidor.
 */
export interface PersistedAnalyticsEvent extends ValidatedAnalyticsEvent {
  occurred_at: string;
}

/**
 * Validação **autoritativa** de um payload de evento — usada pelo endpoint
 * `/api/analytics/event` (nunca confia no cliente) e também pelo cliente antes
 * de enviar (defesa em profundidade, evita round-trips inúteis). Descarta
 * silenciosamente qualquer propriedade fora da lista fechada — nunca repassa
 * um valor arbitrário adiante. Retorna `null` quando o evento em si é inválido
 * (tipo desconhecido ou `session_id` ausente/mal formado).
 *
 * Deliberadamente nunca lê nem repassa `occurred_at`: mesmo que o cliente
 * envie esse campo, ele é ignorado aqui — o horário persistido é sempre
 * atribuído pelo servidor, depois desta validação (ver `PersistedAnalyticsEvent`).
 */
export function validateEventPayload(raw: unknown): ValidatedAnalyticsEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;

  if (!isAllowedEvent(input.event)) return null;
  if (typeof input.session_id !== "string" || !UUID_V4_PATTERN.test(input.session_id)) return null;

  const result: ValidatedAnalyticsEvent = {
    event: input.event,
    session_id: input.session_id,
  };

  const route_id = inList(input.route_id, ALLOWED_ROUTE_IDS);
  if (route_id) result.route_id = route_id;

  const tool_id = inList(input.tool_id, ALLOWED_TOOL_IDS);
  if (tool_id) result.tool_id = tool_id;

  const cta_id = inList(input.cta_id, ALLOWED_CTA_IDS);
  if (cta_id) result.cta_id = cta_id;

  const outcome = inList(input.outcome, ALLOWED_OUTCOMES);
  if (outcome) result.outcome = outcome;

  const error_category = inList(input.error_category, ALLOWED_ERROR_CATEGORIES);
  if (error_category) result.error_category = error_category;

  const compression_level = inList(input.compression_level, ALLOWED_COMPRESSION_LEVELS);
  if (compression_level) result.compression_level = compression_level;

  const parts_bucket = inList(input.parts_bucket, ALLOWED_PARTS_BUCKETS);
  if (parts_bucket) result.parts_bucket = parts_bucket;

  const oversized_parts_bucket = inList(input.oversized_parts_bucket, ALLOWED_OVERSIZED_PARTS_BUCKETS);
  if (oversized_parts_bucket) result.oversized_parts_bucket = oversized_parts_bucket;

  const duration_bucket = inList(input.duration_bucket, ALLOWED_DURATION_BUCKETS);
  if (duration_bucket) result.duration_bucket = duration_bucket;

  const utm_source = sanitizeUtmValue(input.utm_source);
  if (utm_source) result.utm_source = utm_source;
  const utm_medium = sanitizeUtmValue(input.utm_medium);
  if (utm_medium) result.utm_medium = utm_medium;
  const utm_campaign = sanitizeUtmValue(input.utm_campaign);
  if (utm_campaign) result.utm_campaign = utm_campaign;
  const utm_content = sanitizeUtmValue(input.utm_content);
  if (utm_content) result.utm_content = utm_content;
  const utm_term = sanitizeUtmValue(input.utm_term);
  if (utm_term) result.utm_term = utm_term;

  const referrer_host = referrerToHostname(input.referrer_host);
  if (referrer_host) result.referrer_host = referrer_host;

  const landing_page = inList(input.landing_page, ALLOWED_ROUTE_IDS);
  if (landing_page) result.landing_page = landing_page;

  return result;
}

/** Tamanho máximo aceito para o corpo bruto da requisição, em bytes. */
export const MAX_EVENT_BODY_BYTES = 4096;
