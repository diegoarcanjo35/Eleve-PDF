import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../event";
import { __resetRateLimitStateForTests } from "../../../_shared/rateLimit";

const VALID_ORIGIN = "https://elevepdf.elevesites.com.br";
const VALID_HOST = "elevepdf.elevesites.com.br";

function fakeDb() {
  const run = vi.fn().mockResolvedValue(undefined);
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, run, bind };
}

function makeRequest(body: unknown, overrides: Partial<Record<string, string>> = {}, rawBody?: string) {
  const headers = new Headers({
    Origin: VALID_ORIGIN,
    Host: VALID_HOST,
    "Content-Type": "application/json",
    ...overrides,
  });
  return new Request("https://elevepdf.elevesites.com.br/api/analytics/event", {
    method: "POST",
    headers,
    body: rawBody ?? JSON.stringify(body),
  });
}

const VALID_EVENT = { event: "page_view", session_id: "11111111-1111-4111-8111-111111111111" };

describe("POST /api/analytics/event", () => {
  beforeEach(() => {
    __resetRateLimitStateForTests();
  });

  it("aceita um evento válido e grava via statement preparado", async () => {
    const db = fakeDb();
    const response = await onRequestPost({
      request: makeRequest(VALID_EVENT),
      env: { DB: db as never },
    } as never);
    expect(response.status).toBe(204);
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.prepare.mock.calls[0][0]).toMatch(/INSERT INTO analytics_events/);
    expect(db.run).toHaveBeenCalledTimes(1);
  });

  it("rejeita Origin estranho", async () => {
    const db = fakeDb();
    const response = await onRequestPost({
      request: makeRequest(VALID_EVENT, { Origin: "https://attacker.example.com" }),
      env: { DB: db as never },
    } as never);
    expect(response.status).toBe(403);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("rejeita Content-Type diferente de application/json", async () => {
    const db = fakeDb();
    const response = await onRequestPost({
      request: makeRequest(VALID_EVENT, { "Content-Type": "text/plain" }),
      env: { DB: db as never },
    } as never);
    expect(response.status).toBe(415);
  });

  it("rejeita corpo maior que o limite máximo", async () => {
    const db = fakeDb();
    const hugePayload = { ...VALID_EVENT, utm_source: "x" }; // corpo real pequeno...
    const rawBody = JSON.stringify(hugePayload) + " ".repeat(10_000); // ...mas o texto bruto extrapola o limite
    const response = await onRequestPost({
      request: makeRequest(hugePayload, {}, rawBody),
      env: { DB: db as never },
    } as never);
    expect(response.status).toBe(413);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("rejeita JSON inválido sem lançar e sem registrar o corpo", async () => {
    const db = fakeDb();
    const response = await onRequestPost({
      request: makeRequest(null, {}, "{ isso não é json"),
      env: { DB: db as never },
    } as never);
    expect(response.status).toBe(400);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("rejeita um payload que não passa na validação de schema (evento fora da lista fechada)", async () => {
    const db = fakeDb();
    const response = await onRequestPost({
      request: makeRequest({ event: "evento_inventado", session_id: VALID_EVENT.session_id }),
      env: { DB: db as never },
    } as never);
    expect(response.status).toBe(400);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("uma falha no endpoint nunca lança — sempre devolve uma Response, nunca derruba o chamador", async () => {
    const db = {
      prepare: vi.fn().mockImplementation(() => {
        throw new Error("D1 indisponível");
      }),
    };
    const response = await onRequestPost({
      request: makeRequest(VALID_EVENT),
      env: { DB: db as never },
    } as never);
    expect(response.status).toBe(500);
  });

  it("ignora occurred_at enviado pelo cliente e persiste o horário do servidor", async () => {
    const db = fakeDb();
    const clientForgedTimestamp = "2000-01-01T00:00:00.000Z"; // data falsa, longe do "agora" real
    const before = Date.now();
    const response = await onRequestPost({
      request: makeRequest({ ...VALID_EVENT, occurred_at: clientForgedTimestamp }),
      env: { DB: db as never },
    } as never);
    const after = Date.now();

    expect(response.status).toBe(204);
    expect(db.bind).toHaveBeenCalledTimes(1);
    const insertedOccurredAt = db.bind.mock.calls[0][0] as string; // 1º valor bindado = occurred_at (ver functions/_shared/db.ts)
    expect(insertedOccurredAt).not.toBe(clientForgedTimestamp);
    const insertedMs = new Date(insertedOccurredAt).getTime();
    expect(insertedMs).toBeGreaterThanOrEqual(before);
    expect(insertedMs).toBeLessThanOrEqual(after);
  });

  it("aplica rate limit defensivo por IP após muitas requisições na mesma janela", async () => {
    const db = fakeDb();
    let lastStatus = 0;
    for (let i = 0; i < 25; i += 1) {
      const response = await onRequestPost({
        request: makeRequest(VALID_EVENT, { "CF-Connecting-IP": "203.0.113.9" }),
        env: { DB: db as never },
      } as never);
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });
});
