import { toBase64Url } from "./encoding";

/**
 * Deriva um identificador de rede PSEUDONIMIZADO a partir do IP bruto da
 * requisição — usado exclusivamente como dimensão do rate limit distribuído
 * (`distributedRateLimit.ts`). NUNCA persistido, logado, ou enviado ao
 * Analytics como IP bruto — só este resultado (ver relatório de auditoria
 * Sprint 01E, seção de privacidade).
 *
 * HMAC-SHA256 via Web Crypto (`crypto.subtle`): o mesmo IP sempre produz o
 * mesmo identificador com a MESMA chave (determinístico, necessário para o
 * contador funcionar), mas o IP original não é recuperável a partir do
 * resultado sem o secret `RATE_LIMIT_HMAC_KEY` — diferente de um hash
 * simples (SHA-256 puro do IP seria reversível por força bruta, já que o
 * espaço de IPv4/IPv6 é pequeno o suficiente para uma rainbow table; HMAC
 * com secret privado fecha essa brecha).
 */
export async function deriveNetworkIdentity(ip: string, hmacKeySecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(hmacKeySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return toBase64Url(new Uint8Array(signature));
}
