import { SESSION_TTL_MS } from "../../shared/intelligence/constants";

/** UUID v4 via Web Crypto — criptograficamente aleatório, nunca derivável de
 * identidade do usuário, nunca associado a conta. */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

export function computeExpiresAt(createdAtMs: number): number {
  return createdAtMs + SESSION_TTL_MS;
}

export function isExpired(expiresAtMs: number, nowMs: number = Date.now()): boolean {
  return nowMs >= expiresAtMs;
}
