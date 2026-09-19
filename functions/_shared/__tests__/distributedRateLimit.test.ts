import { describe, expect, it, vi } from "vitest";
import { consumeRateLimitWindow, enforceDistributedRateLimit } from "../distributedRateLimit";

/** Fake D1 mínimo, só para exercitar o UPSERT condicional isoladamente
 * (fora do contexto dos endpoints) — mesma semântica do fake compartilhado
 * usado pelos testes de endpoint, mas local a este arquivo para não
 * depender de um caminho de import através de `functions/api/...`. */
function makeFakeD1() {
  const rows = new Map<string, { count: number; updatedAt: string }>();
  const db = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (query.includes("INSERT INTO intelligence_rate_limit_windows")) {
                const [rateKey, , updatedAt, maxRequests] = values as [string, string, string, number];
                const existing = rows.get(rateKey);
                if (!existing) {
                  rows.set(rateKey, { count: 1, updatedAt });
                  return { meta: { changes: 1 } };
                }
                if (existing.count < maxRequests) {
                  existing.count += 1;
                  existing.updatedAt = updatedAt;
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              throw new Error(`fakeD1.run: query não tratada: ${query}`);
            },
          };
        },
      };
    },
  };
  return { db, rows };
}

describe("consumeRateLimitWindow", () => {
  it("permite requisições dentro do limite e bloqueia a partir do limite, na mesma janela", async () => {
    const { db } = makeFakeD1();
    const now = Date.now();
    const outcomes: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      outcomes.push(await consumeRateLimitWindow(db as never, "op:identity", { windowMs: 60_000, maxRequests: 3 }, now));
    }
    expect(outcomes).toEqual(["allowed", "allowed", "allowed", "blocked", "blocked"]);
  });

  it("16. janela expirada permite nova requisição (bucket de janela diferente)", async () => {
    const { db } = makeFakeD1();
    const t0 = Date.now();
    for (let i = 0; i < 3; i += 1) {
      await consumeRateLimitWindow(db as never, "op:identity", { windowMs: 1000, maxRequests: 3 }, t0);
    }
    const blocked = await consumeRateLimitWindow(db as never, "op:identity", { windowMs: 1000, maxRequests: 3 }, t0);
    expect(blocked).toBe("blocked");

    const nextWindow = t0 + 1000; // bucket seguinte
    const allowedAgain = await consumeRateLimitWindow(db as never, "op:identity", { windowMs: 1000, maxRequests: 3 }, nextWindow);
    expect(allowedAgain).toBe("allowed");
  });

  it("15. concorrência com só 1 vaga restante: exatamente uma das requisições concorrentes é aceita (consumo atômico, sem race)", async () => {
    const { db } = makeFakeD1();
    const now = Date.now();
    // Consome 2 das 3 vagas antes da disputa concorrente.
    await consumeRateLimitWindow(db as never, "op:identity", { windowMs: 60_000, maxRequests: 3 }, now);
    await consumeRateLimitWindow(db as never, "op:identity", { windowMs: 60_000, maxRequests: 3 }, now);

    const [a, b] = await Promise.all([
      consumeRateLimitWindow(db as never, "op:identity", { windowMs: 60_000, maxRequests: 3 }, now),
      consumeRateLimitWindow(db as never, "op:identity", { windowMs: 60_000, maxRequests: 3 }, now),
    ]);

    const outcomes = [a, b].sort();
    expect(outcomes).toEqual(["allowed", "blocked"]);
  });

  it("nunca lança — falha do D1 vira outcome 'error', nunca exceção não tratada", async () => {
    const failingDb = {
      prepare: vi.fn().mockImplementation(() => {
        throw new Error("D1 indisponível");
      }),
    };
    const outcome = await consumeRateLimitWindow(failingDb as never, "op:identity", { windowMs: 60_000, maxRequests: 3 });
    expect(outcome).toBe("error");
  });
});

describe("enforceDistributedRateLimit", () => {
  it("17. sem RATE_LIMIT_HMAC_KEY configurado: fail-closed ('error'), nunca 'allowed'", async () => {
    const { db } = makeFakeD1();
    const outcome = await enforceDistributedRateLimit(
      db as never,
      undefined,
      { operation: "ask", ip: "203.0.113.55" },
      { windowMs: 60_000, maxRequests: 10 },
    );
    expect(outcome).toBe("error");
  });

  it("chaves diferentes (por sessão) nunca compartilham a mesma janela de contagem", async () => {
    const { db } = makeFakeD1();
    const config = { windowMs: 60_000, maxRequests: 1 };
    const first = await enforceDistributedRateLimit(
      db as never,
      "secret-de-teste",
      { operation: "ask", ip: "203.0.113.55", sessionId: "session-a" },
      config,
    );
    const second = await enforceDistributedRateLimit(
      db as never,
      "secret-de-teste",
      { operation: "ask", ip: "203.0.113.55", sessionId: "session-b" },
      config,
    );
    expect(first).toBe("allowed");
    expect(second).toBe("allowed"); // sessão diferente => janela diferente, mesmo com o mesmo IP
  });

  it("23. citar um sessionId sem identidade de rede correspondente ainda respeita o limite por sessão — a chave nunca depende só do sessionId", async () => {
    const { db } = makeFakeD1();
    const config = { windowMs: 60_000, maxRequests: 1 };
    const fromIpA = await enforceDistributedRateLimit(
      db as never,
      "secret-de-teste",
      { operation: "ask", ip: "203.0.113.55", sessionId: "session-a" },
      config,
    );
    // Mesmo sessionId, IP diferente => identidade de rede diferente =>
    // consome uma janela DIFERENTE (a chave nunca é só `sessionId`).
    const fromIpB = await enforceDistributedRateLimit(
      db as never,
      "secret-de-teste",
      { operation: "ask", ip: "198.51.100.20", sessionId: "session-a" },
      config,
    );
    expect(fromIpA).toBe("allowed");
    expect(fromIpB).toBe("allowed");
  });
});
