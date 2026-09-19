import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../sessions";
import { __resetRateLimitStateForTests } from "../../../_shared/rateLimit";

const VALID_ORIGIN = "https://elevepdf.elevesites.com.br";
const VALID_HOST = "elevepdf.elevesites.com.br";

function fakeDb() {
  const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, run, bind };
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

  it("cria uma sessão válida com ID opaco, status created e expiresAt", async () => {
    const db = fakeDb();
    const response = await onRequestPost({ request: makeRequest(), env: { INTEL_DB: db as never } } as never);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { sessionId: string; status: string; expiresAt: string };
    expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.status).toBe("created");
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.prepare.mock.calls[0][0]).toMatch(/INSERT INTO intelligence_sessions/);
  });

  it("rejeita Origin estranho", async () => {
    const db = fakeDb();
    const response = await onRequestPost({
      request: makeRequest({ Origin: "https://attacker.example.com" }),
      env: { INTEL_DB: db as never },
    } as never);
    expect(response.status).toBe(403);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("aplica rate limit defensivo por IP", async () => {
    const db = fakeDb();
    let lastStatus = 0;
    for (let i = 0; i < 25; i += 1) {
      const response = await onRequestPost({
        request: makeRequest({ "CF-Connecting-IP": "203.0.113.55" }),
        env: { INTEL_DB: db as never },
      } as never);
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("falha de escrita no D1 nunca lança — sempre devolve uma Response", async () => {
    const db = {
      prepare: vi.fn().mockImplementation(() => {
        throw new Error("D1 indisponível");
      }),
    };
    const response = await onRequestPost({ request: makeRequest(), env: { INTEL_DB: db as never } } as never);
    expect(response.status).toBe(500);
  });
});
