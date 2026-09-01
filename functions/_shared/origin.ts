/**
 * Verificação de Origin/Host para os endpoints de Analytics. Same-origin
 * estrito em produção; localhost liberado só para desenvolvimento local
 * (nunca é o valor configurado em produção); subdomínios de preview do
 * projeto Pages `eleve-pdf` liberados só quando ANALYTICS_ALLOW_PAGES_PREVIEW
 * está explicitamente habilitado (sempre "false" em produção — ver
 * wrangler.toml).
 */
const PRODUCTION_ORIGIN = "https://elevepdf.elevesites.com.br";
const PRODUCTION_HOST = "elevepdf.elevesites.com.br";

const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LOCAL_DEV_HOST_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

// Escopo estrito ao domínio *.pages.dev do projeto Pages `eleve-pdf` — nunca
// qualquer outro projeto Pages, nunca `*.pages.dev` genérico. Cada rótulo de
// subdomínio é validado explicitamente (alfanumérico + hífen interno, sem
// `:`, `@`, `/` ou `.` fora dos separadores) para que nada disfarçado de
// credencial ou caminho passe como parte do host. A âncora final `$` combinada
// com o rótulo fechado impede sufixos como `.eleve-pdf.pages.dev.evil.com` e
// prefixos colados como `evil-eleve-pdf.pages.dev` (que só "parecem" terminar
// com o domínio certo por substring, mas não têm o `.` separador exigido).
const PAGES_PREVIEW_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const PAGES_PREVIEW_ORIGIN_PATTERN = new RegExp(`^https://(?:${PAGES_PREVIEW_LABEL}\\.)*eleve-pdf\\.pages\\.dev$`);
const PAGES_PREVIEW_HOST_PATTERN = new RegExp(`^(?:${PAGES_PREVIEW_LABEL}\\.)*eleve-pdf\\.pages\\.dev$`);

export interface OriginCheckOptions {
  /** "true" só em desenvolvimento local — nunca em produção nem em preview. */
  allowLocalDev: boolean;
  /** "true" só nos deployments de preview do projeto Pages `eleve-pdf` — nunca em produção. */
  allowPagesPreview: boolean;
}

function isAllowedOrigin(originHeader: string, options: OriginCheckOptions): boolean {
  if (originHeader === PRODUCTION_ORIGIN) return true;
  if (options.allowLocalDev && LOCAL_DEV_ORIGIN_PATTERN.test(originHeader)) return true;
  if (options.allowPagesPreview && PAGES_PREVIEW_ORIGIN_PATTERN.test(originHeader.toLowerCase())) return true;
  return false;
}

function isAllowedHost(hostHeader: string, options: OriginCheckOptions): boolean {
  if (hostHeader === PRODUCTION_HOST) return true;
  if (options.allowLocalDev && LOCAL_DEV_HOST_PATTERN.test(hostHeader)) return true;
  if (options.allowPagesPreview && PAGES_PREVIEW_HOST_PATTERN.test(hostHeader.toLowerCase())) return true;
  return false;
}

/** Hostname (+ porta, se houver) de um Origin no formato `<protocolo>://<resto>`. */
function hostnameFromOrigin(originHeader: string): string {
  const separatorIndex = originHeader.indexOf("://");
  return separatorIndex === -1 ? originHeader : originHeader.slice(separatorIndex + 3);
}

/**
 * Valida Origin e Host de uma requisição de escrita de Analytics em conjunto.
 * Exige: header presente em ambos, HTTPS (via as próprias listas de padrões
 * aceitos acima — nenhuma delas aceita `http://` fora do dev local), Origin e
 * Host individualmente permitidos, e o hostname do Origin batendo exatamente
 * com o Host efetivo da requisição. Essa última checagem é o que impede, por
 * exemplo, um Origin de preview legítimo (`a.eleve-pdf.pages.dev`) ser
 * combinado com um Host de outro preview legítimo (`b.eleve-pdf.pages.dev`)
 * — cada um sozinho passaria na allowlist, mas juntos indicam Origin/Host
 * divergentes, o que nunca é uma requisição de navegador genuína.
 */
export function isAllowedRequestOrigin(
  originHeader: string | null,
  hostHeader: string | null,
  options: OriginCheckOptions,
): boolean {
  if (!originHeader || !hostHeader) return false;
  if (!isAllowedOrigin(originHeader, options) || !isAllowedHost(hostHeader, options)) return false;
  return hostnameFromOrigin(originHeader).toLowerCase() === hostHeader.toLowerCase();
}
