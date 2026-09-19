/**
 * Codificação base64url (RFC 4648 §5), sem padding — segura para uso direto
 * em headers HTTP e como parte de chaves de texto, ao contrário de base64
 * padrão (que usa `+`, `/`, `=`, todos problemáticos em URL/header). Usada
 * tanto pela capability de sessão (`sessionCapability.ts`) quanto pela
 * identidade de rede pseudonimizada via HMAC (`networkIdentity.ts`).
 *
 * `btoa`/`atob` são globais padrão do runtime Workers/Pages Functions (Web
 * API, não Node) — nenhuma dependência adicional.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
