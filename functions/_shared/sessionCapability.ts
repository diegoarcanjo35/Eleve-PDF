import { toBase64Url } from "./encoding";

/**
 * "sessionCapability" — segredo de autorização separado do `sessionId`
 * (Fase 01, Sprint 01E.1). A partir desta sprint, conhecer o `sessionId`
 * NUNCA mais é suficiente para operar a sessão: todo endpoint protegido
 * exige também este segredo, transportado exclusivamente via
 * `Authorization: Bearer <capability>` — nunca em query string, URL, path
 * ou cookie (ver relatório de auditoria Sprint 01E, item 14 — BLOCKER
 * fechado aqui).
 */

const CAPABILITY_BYTES = 32; // 256 bits de entropia — mínimo exigido, nunca menos.

/**
 * Gera a capability via `crypto.getRandomValues` (Web Crypto,
 * criptograficamente segura) — NUNCA `Math.random`, que não é adequado para
 * segredos de segurança (não é um CSPRNG).
 */
export function generateSessionCapability(): string {
  const bytes = new Uint8Array(CAPABILITY_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * O valor bruto da capability NUNCA é persistido — só este hash SHA-256
 * (via `crypto.subtle.digest`, Web Crypto padrão, mesma primitiva já usada
 * em todo o resto do projeto). Server-side, só este hash é comparado; o
 * valor original nunca é reconstruível a partir dele.
 */
export async function hashCapability(capability: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(capability));
  return toBase64Url(new Uint8Array(digest));
}

export function extractBearerCapability(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer (.+)$/.exec(authorizationHeader);
  return match ? match[1] : null;
}

/**
 * Comparação em tempo constante, byte a byte, sobre os HASHES (nunca sobre
 * o segredo bruto).
 *
 * AUDITORIA (item 4 da Sprint 01E.1 — obrigatória antes desta função
 * existir): o runtime Workers/Pages Functions não expõe, no Web Crypto
 * padrão, nenhuma primitiva documentada de comparação em tempo constante
 * para strings/bytes — não existe `crypto.subtle.*Equal`. `node:crypto`
 * (que teria `timingSafeEqual`) NÃO está confirmado disponível aqui: este
 * projeto não declara a flag de compatibilidade `nodejs_compat` em
 * `wrangler.toml` (conferido nesta sprint). Nenhuma função
 * `timingSafeEqual` foi inventada, e nenhuma dependência externa foi
 * adicionada só para isso.
 *
 * Implementação: acumula XOR sobre TODOS os bytes, sem early-exit
 * condicionado ao CONTEÚDO — melhor esforço contra timing attack disponível
 * sem sair do Web Crypto padrão, não uma garantia formal do runtime.
 *
 * LIMITAÇÃO EXPLÍCITA: ainda existe um único early-return condicionado ao
 * COMPRIMENTO das strings (não ao conteúdo). Isso é aceitável aqui porque
 * os dois lados desta comparação são sempre a saída de SHA-256 na mesma
 * codificação base64url (comprimento fixo — 43 caracteres —, nunca
 * dependente do segredo em si), então esse early-return nunca vaza
 * informação sobre a capability.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifica a capability enviada pelo cliente (header `Authorization`)
 * contra o hash armazenado na sessão (`capability_hash`, coluna da
 * migration 0004). NUNCA revela, pelo valor de retorno ou por quem chama,
 * qual destes motivos causou uma falha: sessão inexistente, header ausente,
 * capability incorreta, ou hash divergente — todos retornam `false`
 * igualmente, e quem chama deve mapear qualquer `false` para a MESMA
 * resposta HTTP genérica (ver endpoints `ingest.ts`/`retrieve.ts`/`ask.ts`,
 * `unauthorizedError()`).
 *
 * Sessão sem `capability_hash` (sessão legada, criada antes desta sprint,
 * ou qualquer estado nulo) é SEMPRE tratada como não autorizada — decisão
 * explícita desta sprint, sem fallback para `sessionId` sozinho (ver
 * migration 0004_session_capability.sql).
 */
export async function verifySessionCapability(
  authorizationHeader: string | null,
  storedCapabilityHash: string | null,
): Promise<boolean> {
  if (!storedCapabilityHash) return false;
  const provided = extractBearerCapability(authorizationHeader);
  if (!provided) return false;
  const providedHash = await hashCapability(provided);
  return constantTimeEqual(providedHash, storedCapabilityHash);
}
