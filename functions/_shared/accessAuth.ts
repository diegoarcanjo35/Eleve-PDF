/**
 * Validação real (assinatura + claims) de um JWT do Cloudflare Access, usando
 * só Web Crypto (disponível nativamente no runtime de Workers/Pages Functions
 * — nenhuma dependência de JWT adicionada). Nunca confia apenas na presença
 * do header `Cf-Access-Jwt-Assertion`: busca o JWKS do próprio time Cloudflare
 * configurado, verifica a assinatura RS256, o emissor (`iss`), a audiência
 * (`aud`) e a expiração (`exp`).
 *
 * Enquanto `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` não estiverem configurados
 * (variáveis de ambiente do Pages), `verifyAccessJwt` sempre retorna `null` —
 * ou seja, o painel fica bloqueado por padrão até a implantação real do
 * Cloudflare Access ser configurada (ver relatório, seção "Proteção obrigatória").
 */

export interface AccessAuthConfig {
  teamDomain: string; // ex.: "eleve-sites.cloudflareaccess.com"
  audience: string; // AUD da aplicação Access protegendo o painel
}

/** `JsonWebKey` do lib.dom não inclui `kid` (usado pelo JWKS do Access para achar a chave certa). */
type AccessJwk = JsonWebKey & { kid?: string };

interface JwkCacheEntry {
  keys: AccessJwk[];
  fetchedAt: number;
}

let jwksCache: JwkCacheEntry | null = null;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

async function fetchJwks(teamDomain: string): Promise<AccessJwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("failed to fetch Access JWKS");
  const body = (await response.json()) as { keys: AccessJwk[] };
  jwksCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

interface AccessJwtPayload {
  aud?: string[] | string;
  iss?: string;
  exp?: number;
  email?: string;
}

/**
 * Retorna o payload decodificado do JWT quando válido (assinatura, emissor,
 * audiência e expiração todos conferem), ou `null` para qualquer falha —
 * nunca lança, para o chamador sempre tratar como "não autorizado".
 */
export async function verifyAccessJwt(
  jwt: string | null,
  config: AccessAuthConfig | null,
): Promise<AccessJwtPayload | null> {
  if (!jwt || !config || !config.teamDomain || !config.audience) return null;

  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  let header: { kid?: string; alg?: string };
  let payload: AccessJwtPayload;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const expectedIssuer = `https://${config.teamDomain}`;
  if (payload.iss !== expectedIssuer) return null;

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(config.audience)) return null;

  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;

  let jwks: AccessJwk[];
  try {
    jwks = await fetchJwks(config.teamDomain);
  } catch {
    return null;
  }

  const matchingKey = jwks.find((key) => key.kid === header.kid);
  if (!matchingKey) return null;

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      matchingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = base64UrlDecode(signatureB64);
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const isValid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, signedData);
    return isValid ? payload : null;
  } catch {
    return null;
  }
}

/** Só para testes: limpa o cache do JWKS entre casos. */
export function __resetAccessJwksCacheForTests(): void {
  jwksCache = null;
}
