import { MAX_EVENT_BODY_BYTES, validateEventPayload } from "../../../shared/analytics/validate";
import { isAllowedHost, isAllowedOrigin } from "../../_shared/origin";
import { isRateLimited } from "../../_shared/rateLimit";
import { insertAnalyticsEvent, type AnalyticsD1 } from "../../_shared/db";

interface Env {
  DB: AnalyticsD1;
  /** "true" só em ambiente de desenvolvimento local — nunca em produção. */
  ANALYTICS_ALLOW_LOCAL_DEV?: string;
}

function genericError(status: number): Response {
  // Nunca devolve detalhes internos (mensagem de validação, stack, etc.).
  return new Response(null, { status });
}

/**
 * POST /api/analytics/event — único endpoint público de escrita de Analytics.
 * Não dá acesso a nenhuma consulta (isso vive em /api/analytics/summary,
 * protegido por Cloudflare Access — ver functions/api/analytics/summary.ts).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const allowLocalDev = env.ANALYTICS_ALLOW_LOCAL_DEV === "true";

  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (!isAllowedOrigin(origin, allowLocalDev) || !isAllowedHost(host, allowLocalDev)) {
    return genericError(403);
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return genericError(415);
  }

  const contentLengthHeader = request.headers.get("Content-Length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_EVENT_BODY_BYTES) {
    return genericError(413);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_EVENT_BODY_BYTES) {
    return genericError(413);
  }

  // Chave de rate limit: IP fornecido pela borda da Cloudflare (não é dado
  // pessoal armazenado — usado só em memória, nunca persistido no D1).
  const rateLimitKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (isRateLimited(rateLimitKey)) {
    return genericError(429);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    // Corpo inválido nunca é registrado em log — só um 400 genérico.
    return genericError(400);
  }

  const validated = validateEventPayload(parsedBody);
  if (!validated) {
    return genericError(400);
  }

  // `occurred_at` é sempre o horário do servidor no momento do recebimento —
  // qualquer valor enviado pelo cliente já foi descartado por
  // `validateEventPayload` (o campo nem existe no contrato público). Nunca
  // aceitar data passada/futura fornecida pelo navegador; sempre UTC.
  const persisted = { ...validated, occurred_at: new Date().toISOString() };

  try {
    await insertAnalyticsEvent(env.DB, persisted);
  } catch {
    // Falha de escrita não deve nunca vazar detalhes de schema/D1 ao cliente,
    // e nunca deve derrubar a ferramenta que originou o evento.
    return genericError(500);
  }

  return new Response(null, { status: 204 });
};

// Qualquer outro método (GET, PUT, DELETE, ...) para esta rota recebe 405
// automaticamente pelo próprio roteador de Pages Functions, por não haver um
// `onRequest`/`onRequestGet` etc. exportado aqui.
