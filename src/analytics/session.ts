import { sanitizeUtmValue, referrerToHostname } from "@shared/analytics/sanitize";
import type { RouteId } from "@shared/analytics/events";

const SESSION_ID_KEY = "elevepdf.analytics.session_id";
const ATTRIBUTION_KEY = "elevepdf.analytics.attribution";

/**
 * UUID pseudônimo, criado só quando o Analytics é efetivamente usado (após
 * consentimento), guardado exclusivamente em `sessionStorage` — vale só para
 * esta aba, nunca persiste entre visitas nem é compartilhado entre abas ou
 * dispositivos. Não é derivado de nenhum dado do PDF, IP, user-agent ou
 * fingerprint — é puro `crypto.randomUUID()`.
 */
export function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage indisponível: gera um id só para esta chamada, sem
    // persistir — pior caso é perder continuidade de sessão, nunca falhar.
    return crypto.randomUUID();
  }
}

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_host?: string;
  landing_page?: RouteId;
}

/**
 * Captura UTM/referrer/landing page uma única vez por sessão (primeiro
 * `page_view`) e guarda em `sessionStorage` — nunca a query string inteira,
 * nunca o `document.referrer` completo, só os campos sanitizados.
 */
export function captureAttributionOnce(pathToRouteId: (path: string) => RouteId | null): Attribution {
  try {
    const cached = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (cached) return JSON.parse(cached) as Attribution;
  } catch {
    // segue para capturar de novo
  }

  const params = new URLSearchParams(window.location.search);
  const attribution: Attribution = {};

  const utmSource = sanitizeUtmValue(params.get("utm_source"));
  if (utmSource) attribution.utm_source = utmSource;
  const utmMedium = sanitizeUtmValue(params.get("utm_medium"));
  if (utmMedium) attribution.utm_medium = utmMedium;
  const utmCampaign = sanitizeUtmValue(params.get("utm_campaign"));
  if (utmCampaign) attribution.utm_campaign = utmCampaign;
  const utmContent = sanitizeUtmValue(params.get("utm_content"));
  if (utmContent) attribution.utm_content = utmContent;
  const utmTerm = sanitizeUtmValue(params.get("utm_term"));
  if (utmTerm) attribution.utm_term = utmTerm;

  const referrerHost = referrerToHostname(document.referrer);
  if (referrerHost) attribution.referrer_host = referrerHost;

  const landingRoute = pathToRouteId(window.location.pathname);
  if (landingRoute) attribution.landing_page = landingRoute;

  try {
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  } catch {
    // sem persistência disponível — a atribuição desta chamada ainda é usada,
    // só não fica disponível para eventos futuros na mesma aba.
  }

  return attribution;
}

/**
 * Limpa a sessão pseudônima e a atribuição capturada — usada em produção
 * quando o consentimento é revogado (ver `consent.ts`), para que uma futura
 * aceitação sempre comece uma sessão nova, nunca reaproveite o `session_id`
 * de antes da revogação.
 */
export function clearSessionState(): void {
  try {
    sessionStorage.removeItem(SESSION_ID_KEY);
    sessionStorage.removeItem(ATTRIBUTION_KEY);
  } catch {
    // ignore
  }
}

/** Só para testes: limpa o estado de sessão/atribuição entre casos. */
export function __resetSessionStateForTests(): void {
  clearSessionState();
}
