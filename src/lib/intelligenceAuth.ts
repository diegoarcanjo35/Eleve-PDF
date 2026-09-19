/**
 * Header `Authorization: Bearer <capability>` — única forma de transporte
 * aceita pelo backend para os endpoints protegidos de sessão (Sprint 01E.1:
 * `functions/_shared/sessionCapability.ts`). Nunca query string, URL, path
 * ou cookie.
 *
 * Centralizado aqui (Sprint 01E.1A/01F) para que ingest/retrieve/ask montem
 * o header de forma idêntica — nunca duplicar esta lógica de segurança em
 * cada client.
 */
export function authorizationHeader(sessionCapability: string): Record<string, string> {
  return { Authorization: `Bearer ${sessionCapability}` };
}
