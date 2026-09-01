/**
 * Verificação de Origin/Host para os endpoints de Analytics. Same-origin
 * estrito em produção; localhost liberado só para desenvolvimento local
 * (nunca é o valor configurado em produção).
 */
const PRODUCTION_ORIGIN = "https://elevepdf.elevesites.com.br";

const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(originHeader: string | null, allowLocalDev: boolean): boolean {
  if (!originHeader) return false;
  if (originHeader === PRODUCTION_ORIGIN) return true;
  if (allowLocalDev && LOCAL_DEV_ORIGIN_PATTERN.test(originHeader)) return true;
  return false;
}

export function isAllowedHost(hostHeader: string | null, allowLocalDev: boolean): boolean {
  if (!hostHeader) return false;
  if (hostHeader === "elevepdf.elevesites.com.br") return true;
  if (allowLocalDev && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hostHeader)) return true;
  return false;
}
