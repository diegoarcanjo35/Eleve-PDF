import { describe, expect, it, vi } from "vitest";
import { runIntelligenceCleanup, type CleanupD1 } from "../intelligenceCleanup";

interface FakeSession {
  id: string;
  expires_at: string;
}
interface FakeChunk {
  id: string;
  session_id: string;
}
interface FakeRateLimitWindow {
  rate_key: string;
  window_start: string;
}

function makeFakeCleanupDb() {
  const sessions = new Map<string, FakeSession>();
  const chunks = new Map<string, FakeChunk>();
  const rateLimitWindows = new Map<string, FakeRateLimitWindow>();

  const db: CleanupD1 = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async all<T>() {
              if (query.includes("SELECT id FROM intelligence_sessions WHERE expires_at")) {
                const [nowIso, limit] = values as [string, number];
                const results = [...sessions.values()]
                  .filter((s) => s.expires_at < nowIso)
                  .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
                  .slice(0, limit)
                  .map((s) => ({ id: s.id }));
                return { results: results as T[] };
              }
              if (query.includes("SELECT id FROM intelligence_chunks WHERE session_id")) {
                const [sessionId] = values as [string];
                const results = [...chunks.values()].filter((c) => c.session_id === sessionId).map((c) => ({ id: c.id }));
                return { results: results as T[] };
              }
              throw new Error(`fakeCleanupDb.all: query não tratada: ${query}`);
            },
            async run() {
              if (query.includes("DELETE FROM intelligence_chunks WHERE session_id")) {
                const [sessionId] = values as [string];
                let changes = 0;
                for (const [id, chunk] of chunks) {
                  if (chunk.session_id === sessionId) {
                    chunks.delete(id);
                    changes += 1;
                  }
                }
                return { meta: { changes } };
              }
              if (query.includes("DELETE FROM intelligence_sessions WHERE id")) {
                const [id] = values as [string];
                const existed = sessions.delete(id);
                return { meta: { changes: existed ? 1 : 0 } };
              }
              if (query.includes("DELETE FROM intelligence_rate_limit_windows WHERE window_start")) {
                const [cutoffIso] = values as [string];
                let changes = 0;
                for (const [key, row] of rateLimitWindows) {
                  if (row.window_start < cutoffIso) {
                    rateLimitWindows.delete(key);
                    changes += 1;
                  }
                }
                return { meta: { changes } };
              }
              throw new Error(`fakeCleanupDb.run: query não tratada: ${query}`);
            },
          };
        },
      };
    },
  };

  return { db, sessions, chunks, rateLimitWindows };
}

function seedSession(sessions: Map<string, FakeSession>, id: string, expiresAt: string) {
  sessions.set(id, { id, expires_at: expiresAt });
}

function seedChunk(chunks: Map<string, FakeChunk>, sessionId: string, index: number) {
  const id = `${sessionId}:${index}`;
  chunks.set(id, { id, session_id: sessionId });
  return id;
}

function makeFakeVectorize(overrides?: { deleteByIds?: (ids: string[]) => Promise<unknown> }) {
  const deleteByIds = vi.fn(overrides?.deleteByIds ?? (async () => ({ mutationId: "fake" })));
  return { deleteByIds } as unknown as Vectorize;
}

const NOW = new Date("2026-01-01T12:00:00.000Z");
const PAST = "2026-01-01T11:00:00.000Z"; // expirado
const FUTURE = "2026-01-01T13:00:00.000Z"; // não expirado

describe("runIntelligenceCleanup (Sprint 01P)", () => {
  it("1. sessão não expirada não é removida", async () => {
    const { db, sessions } = makeFakeCleanupDb();
    seedSession(sessions, "s-future", FUTURE);
    const vectorize = makeFakeVectorize();

    const result = await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(result.scanned).toBe(0);
    expect(sessions.has("s-future")).toBe(true);
  });

  it("2. sessão expirada é elegível e processada", async () => {
    const { db, sessions } = makeFakeCleanupDb();
    seedSession(sessions, "s-expired", PAST);
    const vectorize = makeFakeVectorize();

    const result = await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(result.scanned).toBe(1);
    expect(result.sessions[0]!.sessionId).toBe("s-expired");
  });

  it("3. vetores da sessão expirada são removidos do Vectorize", async () => {
    const { db, sessions, chunks } = makeFakeCleanupDb();
    seedSession(sessions, "s-expired", PAST);
    seedChunk(chunks, "s-expired", 0);
    seedChunk(chunks, "s-expired", 1);
    const vectorize = makeFakeVectorize();

    await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(vectorize.deleteByIds).toHaveBeenCalledWith(["s-expired:0", "s-expired:1"]);
  });

  it("4. chunks da sessão expirada são removidos do D1", async () => {
    const { db, sessions, chunks } = makeFakeCleanupDb();
    seedSession(sessions, "s-expired", PAST);
    seedChunk(chunks, "s-expired", 0);
    const vectorize = makeFakeVectorize();

    await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(chunks.size).toBe(0);
  });

  it("5. sessão expirada é removida do D1", async () => {
    const { db, sessions } = makeFakeCleanupDb();
    seedSession(sessions, "s-expired", PAST);
    const vectorize = makeFakeVectorize();

    await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(sessions.has("s-expired")).toBe(false);
  });

  it("6. idempotência: rodar duas vezes seguidas nunca lança nem corrompe estado", async () => {
    const { db, sessions, chunks } = makeFakeCleanupDb();
    seedSession(sessions, "s-expired", PAST);
    seedChunk(chunks, "s-expired", 0);
    const vectorize = makeFakeVectorize();

    const first = await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);
    const second = await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(first.sessions[0]!.sessionDeleted).toBe(true);
    expect(second.scanned).toBe(0); // nada mais elegível — já foi limpo
    expect(sessions.size).toBe(0);
    expect(chunks.size).toBe(0);
  });

  it("7. falha no Vectorize não apaga chunks/sessão — retry continua possível na próxima invocação", async () => {
    const { db, sessions, chunks } = makeFakeCleanupDb();
    seedSession(sessions, "s-expired", PAST);
    seedChunk(chunks, "s-expired", 0);
    const vectorize = makeFakeVectorize({
      deleteByIds: async () => {
        throw new Error("falha simulada do Vectorize");
      },
    });

    const result = await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(result.sessions[0]!.failed).toBe(true);
    expect(result.sessions[0]!.sessionDeleted).toBe(false);
    // Chunk ainda existe — os IDs continuam recuperáveis para a próxima tentativa.
    expect(chunks.has("s-expired:0")).toBe(true);
    expect(sessions.has("s-expired")).toBe(true);

    // Retry: numa invocação futura (mesmo critério de elegibilidade), com o Vectorize saudável, o cleanup consegue concluir.
    const retryVectorize = makeFakeVectorize();
    const retryResult = await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: retryVectorize }, NOW);
    expect(retryResult.sessions[0]!.sessionDeleted).toBe(true);
    expect(sessions.has("s-expired")).toBe(false);
  });

  it("8. lote é respeitado — nunca processa mais que o batchSize por invocação", async () => {
    const { db, sessions } = makeFakeCleanupDb();
    for (let i = 0; i < 10; i += 1) {
      seedSession(sessions, `s-${i}`, PAST);
    }
    const vectorize = makeFakeVectorize();

    const result = await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW, 3);

    expect(result.scanned).toBe(3);
    expect(sessions.size).toBe(7); // as outras 7 continuam elegíveis para a próxima invocação
  });

  it("limpeza de rate-limit: só remove janelas mais antigas que a retenção, nunca janelas recentes", async () => {
    const { db, rateLimitWindows } = makeFakeCleanupDb();
    rateLimitWindows.set("old", { rate_key: "old", window_start: "2025-12-01T00:00:00.000Z" });
    rateLimitWindows.set("recent", { rate_key: "recent", window_start: "2026-01-01T11:55:00.000Z" });
    const vectorize = makeFakeVectorize();

    const result = await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(result.rateLimitWindowsDeleted).toBe(1);
    expect(rateLimitWindows.has("old")).toBe(false);
    expect(rateLimitWindows.has("recent")).toBe(true);
  });

  it("sem sessões expiradas, chunks/vetores de sessões válidas nunca são tocados", async () => {
    const { db, sessions, chunks } = makeFakeCleanupDb();
    seedSession(sessions, "s-future", FUTURE);
    seedChunk(chunks, "s-future", 0);
    const vectorize = makeFakeVectorize();

    await runIntelligenceCleanup({ INTEL_DB: db, VECTORIZE: vectorize }, NOW);

    expect(vectorize.deleteByIds).not.toHaveBeenCalled();
    expect(chunks.has("s-future:0")).toBe(true);
  });
});
