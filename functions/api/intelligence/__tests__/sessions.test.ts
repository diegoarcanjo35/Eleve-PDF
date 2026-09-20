import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../sessions";
import { __resetRateLimitStateForTests } from "../../../_shared/rateLimit";

const VALID_ORIGIN = "https://elevepdf.elevesites.com.br";
const VALID_HOST = "elevepdf.elevesites.com.br";
/** Secret sintético, só de teste — NUNCA um segredo real (ver item 9 do
 * prompt da Sprint 01E.1: nenhum secret real é criado/configurado aqui). */
const TEST_HMAC_SECRET = "test-only-hmac-secret-01e1-never-a-real-cloudflare-secret";

interface FakeSessionRow {
  id: string;
  created_at: string;
  expires_at: string;
  capability_hash: string;
}

interface FakeRateLimitRow {
  count: number;
  updatedAt: string;
}

/** Fake D1 stateful — cobre as duas escritas que POST /sessions agora faz:
 * o upsert condicional do rate limit distribuído e o INSERT da sessão (que
 * agora carrega `capability_hash` como 4º valor). */
function makeStatefulFakeDb() {
  const sessions = new Map<string, FakeSessionRow>();
  const rateLimitWindows = new Map<string, FakeRateLimitRow>();
  const insertedSessionCalls: unknown[][] = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...values: unknown[]) => ({
        async run() {
          if (query.includes("INSERT INTO intelligence_sessions")) {
            insertedSessionCalls.push(values);
            const [id, createdAt, expiresAt, capabilityHash] = values as [string, string, string, string];
            sessions.set(id, { id, created_at: createdAt, expires_at: expiresAt, capability_hash: capabilityHash });
            return { meta: { changes: 1 } };
          }
          if (query.includes("INSERT INTO intelligence_rate_limit_windows")) {
            const [rateKey, , updatedAt, maxRequests] = values as [string, string, string, number];
            const existing = rateLimitWindows.get(rateKey);
            if (!existing) {
              rateLimitWindows.set(rateKey, { count: 1, updatedAt });
              return { meta: { changes: 1 } };
            }
            if (existing.count < maxRequests) {
              existing.count += 1;
              existing.updatedAt = updatedAt;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          throw new Error(`fakeDb.run: query não tratada: ${query}`);
        },
      }),
    })),
  };

  return { db, sessions, rateLimitWindows, insertedSessionCalls };
}

function makeRequest(overrides: Partial<Record<string, string>> = {}) {
  const headers = new Headers({ Origin: VALID_ORIGIN, Host: VALID_HOST, ...overrides });
  return new Request("https://elevepdf.elevesites.com.br/api/intelligence/sessions", {
    method: "POST",
    headers,
  });
}

describe("POST /api/intelligence/sessions", () => {
  beforeEach(() => {
    __resetRateLimitStateForTests();
  });

  it("1. cria uma sessão válida com ID opaco, sessionCapability de 256 bits, status created e expiresAt", async () => {
    const { db, insertedSessionCalls } = makeStatefulFakeDb();
    const response = await onRequestPost({
      request: makeRequest(),
      env: { INTEL_DB: db as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET, ELEVE_IA_ENABLED: "true" },
    } as never);
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sessionId: string;
      sessionCapability: string;
      status: string;
      expiresAt: string;
    };
    expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    // 256 bits em base64url sem padding => 43 caracteres.
    expect(body.sessionCapability).toHaveLength(43);
    expect(body.sessionCapability).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.status).toBe("created");
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // 3. banco guarda somente o HASH, nunca a capability bruta.
    expect(insertedSessionCalls).toHaveLength(1);
    const [, , , storedCapabilityHash] = insertedSessionCalls[0]! as [string, string, string, string];
    expect(storedCapabilityHash).not.toBe(body.sessionCapability);
    expect(storedCapabilityHash).toHaveLength(43);
  });

  it("rejeita Origin estranho antes de tocar o D1", async () => {
    const { db } = makeStatefulFakeDb();
    const response = await onRequestPost({
      request: makeRequest({ Origin: "https://attacker.example.com" }),
      env: { INTEL_DB: db as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET, ELEVE_IA_ENABLED: "true" },
    } as never);
    expect(response.status).toBe(403);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("aplica rate limit defensivo em memória por IP", async () => {
    const { db } = makeStatefulFakeDb();
    let lastStatus = 0;
    for (let i = 0; i < 25; i += 1) {
      const response = await onRequestPost({
        request: makeRequest({ "CF-Connecting-IP": "203.0.113.55" }),
        env: { INTEL_DB: db as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET, ELEVE_IA_ENABLED: "true" },
      } as never);
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("aplica rate limit distribuído autoritativo (D1) — mais restritivo que o best-effort em memória", async () => {
    const { db } = makeStatefulFakeDb();
    let lastStatus = 0;
    // RATE_LIMIT_SESSION_CREATE_MAX = 10 (constants.ts): a 11ª requisição na
    // mesma janela deve ser bloqueada pelo D1, mesmo o limitador em memória
    // (20/10s) ainda tendo vaga sobrando.
    for (let i = 0; i < 11; i += 1) {
      const response = await onRequestPost({
        request: makeRequest({ "CF-Connecting-IP": "203.0.113.99" }),
        env: { INTEL_DB: db as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET, ELEVE_IA_ENABLED: "true" },
      } as never);
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("20. sem RATE_LIMIT_HMAC_KEY configurado: fail-closed (503), sessão nunca criada", async () => {
    const { db, sessions } = makeStatefulFakeDb();
    const response = await onRequestPost({
      request: makeRequest(),
      env: { INTEL_DB: db as never, ELEVE_IA_ENABLED: "true" },
    } as never);
    expect(response.status).toBe(503);
    expect(sessions.size).toBe(0);
  });

  it("falha do D1 durante a verificação do rate limit distribuído: fail-closed (503), sessão nunca criada", async () => {
    const failingDb = {
      prepare: vi.fn().mockImplementation(() => {
        throw new Error("D1 indisponível");
      }),
    };
    const response = await onRequestPost({
      request: makeRequest(),
      env: { INTEL_DB: failingDb as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET, ELEVE_IA_ENABLED: "true" },
    } as never);
    expect(response.status).toBe(503);
  });

  it("falha do D1 ao persistir a sessão (depois do rate limit já confirmado): 500, nunca lança", async () => {
    const { db } = makeStatefulFakeDb();
    const originalPrepare = db.prepare;
    const partiallyFailingDb = {
      prepare: vi.fn((query: string) => {
        if (query.includes("INSERT INTO intelligence_sessions")) {
          return {
            bind: () => ({
              async run() {
                throw new Error("D1 indisponível");
              },
            }),
          };
        }
        return originalPrepare(query);
      }),
    };
    const response = await onRequestPost({
      request: makeRequest(),
      env: { INTEL_DB: partiallyFailingDb as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET, ELEVE_IA_ENABLED: "true" },
    } as never);
    expect(response.status).toBe(500);
  });

  it("Sprint 01H — feature flag desligada (padrão): 404, D1 nunca tocado, mesmo com Origin/HMAC válidos", async () => {
    const { db, sessions } = makeStatefulFakeDb();
    const response = await onRequestPost({
      request: makeRequest(),
      env: { INTEL_DB: db as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET },
    } as never);
    expect(response.status).toBe(404);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(sessions.size).toBe(0);
  });

  it("Sprint 01H — feature flag com valor diferente de \"true\": continua desligada (404)", async () => {
    const { db } = makeStatefulFakeDb();
    const response = await onRequestPost({
      request: makeRequest(),
      env: { INTEL_DB: db as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET, ELEVE_IA_ENABLED: "false" },
    } as never);
    expect(response.status).toBe(404);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("10. resposta de erro nunca contém a capability (corpo vazio)", async () => {
    const { db } = makeStatefulFakeDb();
    const response = await onRequestPost({
      request: makeRequest({ Origin: "https://attacker.example.com" }),
      env: { INTEL_DB: db as never, RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET, ELEVE_IA_ENABLED: "true" },
    } as never);
    const text = await response.text();
    expect(text).toBe("");
  });
});
