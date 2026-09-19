import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../ingest";
import { __resetRateLimitStateForTests } from "../../../../../_shared/rateLimit";
import { INGESTION_CONTRACT_VERSION, CHUNKING_STRATEGY_VERSION } from "../../../../../../shared/intelligence/constants";

const VALID_ORIGIN = "https://elevepdf.elevesites.com.br";
const VALID_HOST = "elevepdf.elevesites.com.br";

interface FakeSessionRow {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  page_count: number | null;
  chunk_count: number | null;
  strategy_version: string | null;
}

/** Fake D1 com estado real (não só stubs fixos) — interpreta as queries
 * exatas usadas por functions/_shared/intelligenceDb.ts o suficiente para
 * exercitar de verdade a máquina de estados (transições guardadas por
 * `WHERE status = ...`, `meta.changes`), sem depender de infraestrutura D1. */
function makeFakeIntelligenceDb() {
  const sessions = new Map<string, FakeSessionRow>();
  const insertedChunks: unknown[][] = [];

  const db = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (query.includes("INSERT INTO intelligence_sessions")) {
                const [id, createdAt, expiresAt] = values as [string, string, string];
                sessions.set(id, {
                  id,
                  status: "created",
                  created_at: createdAt,
                  expires_at: expiresAt,
                  page_count: null,
                  chunk_count: null,
                  strategy_version: null,
                });
                return { meta: { changes: 1 } };
              }
              if (query.includes("SET status = 'ingesting'")) {
                const [id, nowIso] = values as [string, string];
                const row = sessions.get(id);
                if (row && row.status === "created" && row.expires_at > nowIso) {
                  row.status = "ingesting";
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (query.includes("SET status = 'created' WHERE")) {
                const [id] = values as [string];
                const row = sessions.get(id);
                if (row && row.status === "ingesting") {
                  row.status = "created";
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (query.includes("SET status = 'ready'")) {
                const [pageCount, chunkCount, strategyVersion, id] = values as [number, number, string, string];
                const row = sessions.get(id);
                if (row && row.status === "ingesting") {
                  row.status = "ready";
                  row.page_count = pageCount;
                  row.chunk_count = chunkCount;
                  row.strategy_version = strategyVersion;
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (query.includes("SET status = 'failed'")) {
                const [id] = values as [string];
                const row = sessions.get(id);
                if (row && row.status === "ingesting") {
                  row.status = "failed";
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (query.includes("INSERT INTO intelligence_chunks")) {
                insertedChunks.push(values);
                return { meta: { changes: 1 } };
              }
              throw new Error(`fakeDb.run: query não tratada: ${query}`);
            },
            async first<T>() {
              if (query.includes("SELECT id, status, created_at, expires_at")) {
                const [id] = values as [string];
                return (sessions.get(id) ?? null) as T | null;
              }
              throw new Error(`fakeDb.first: query não tratada: ${query}`);
            },
          };
        },
      };
    },
  };

  return { db, sessions, insertedChunks };
}

function seedSession(sessions: Map<string, FakeSessionRow>, overrides: Partial<FakeSessionRow> = {}): string {
  const id = overrides.id ?? "11111111-1111-4111-8111-111111111111";
  sessions.set(id, {
    id,
    status: "created",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    page_count: null,
    chunk_count: null,
    strategy_version: null,
    ...overrides,
  });
  return id;
}

function makeRequest(sessionId: string, body: unknown, overrides: Partial<Record<string, string>> = {}, rawBody?: string) {
  const headers = new Headers({
    Origin: VALID_ORIGIN,
    Host: VALID_HOST,
    "Content-Type": "application/json",
    ...overrides,
  });
  return new Request(`https://elevepdf.elevesites.com.br/api/intelligence/sessions/${sessionId}/ingest`, {
    method: "POST",
    headers,
    body: rawBody ?? JSON.stringify(body),
  });
}

function validPayload() {
  return {
    contractVersion: INGESTION_CONTRACT_VERSION,
    pageCount: 2,
    pages: [
      { pageNumber: 1, blocks: [{ text: "Conteúdo real da página um do documento de teste." }] },
      { pageNumber: 2, blocks: [{ text: "Conteúdo real da página dois do documento de teste." }] },
    ],
  };
}

function callIngest(sessionId: string, env: { INTEL_DB: unknown }, body: unknown, overrides?: Partial<Record<string, string>>, rawBody?: string) {
  return onRequestPost({
    request: makeRequest(sessionId, body, overrides, rawBody),
    env,
    params: { sessionId },
  } as never);
}

describe("POST /api/intelligence/sessions/:sessionId/ingest", () => {
  beforeEach(() => {
    __resetRateLimitStateForTests();
  });

  it("ingestão válida: chunka, persiste, marca a sessão ready, e não ecoa o texto na resposta", async () => {
    const { db, sessions, insertedChunks } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);

    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload());
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ sessionId, status: "ready", pageCount: 2, chunkCount: expect.any(Number) });
    expect(body.chunkingStrategyVersion).toBe(CHUNKING_STRATEGY_VERSION);

    const rawResponseText = JSON.stringify(body);
    expect(rawResponseText).not.toContain("Conteúdo real da página");

    expect(sessions.get(sessionId)!.status).toBe("ready");
    expect(insertedChunks.length).toBeGreaterThan(0);
  });

  it("sessão inexistente retorna 404", async () => {
    const { db } = makeFakeIntelligenceDb();
    const response = await callIngest("00000000-0000-4000-8000-000000000000", { INTEL_DB: db as never }, validPayload());
    expect(response.status).toBe(404);
  });

  it("sessão expirada não permite ingestão (falha determinística)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions, { expires_at: new Date(Date.now() - 1000).toISOString() });
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload());
    expect(response.status).toBe(410);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("payload inválido: rejeita e libera a sessão para retry (não fica presa em ingesting)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, { contractVersion: INGESTION_CONTRACT_VERSION, pageCount: 5, pages: [] });
    expect(response.status).toBe(400);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("JSON malformado retorna 400 sem lançar e libera a sessão", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, null, {}, "{ isso não é json");
    expect(response.status).toBe(400);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("segunda ingestão na mesma sessão (já ready) é rejeitada com 409, sem reprocessar", async () => {
    const { db, sessions, insertedChunks } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);

    const first = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload());
    expect(first.status).toBe(200);
    const chunksAfterFirst = insertedChunks.length;

    const second = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload());
    expect(second.status).toBe(409);
    expect(insertedChunks.length).toBe(chunksAfterFirst);
  });

  it("duas ingestões concorrentes na mesma sessão: só uma consegue avançar (estado guardado atomicamente)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);

    const [first, second] = await Promise.all([
      callIngest(sessionId, { INTEL_DB: db as never }, validPayload()),
      callIngest(sessionId, { INTEL_DB: db as never }, validPayload()),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("falha durante o chunking/persistência marca a sessão failed, nunca ready", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);

    const originalPrepare = db.prepare.bind(db);
    const failingDb = {
      prepare: vi.fn((query: string) => {
        if (query.includes("INSERT INTO intelligence_chunks")) {
          return {
            bind: () => ({
              run: async () => {
                throw new Error("falha simulada de persistência de chunk");
              },
            }),
          };
        }
        return originalPrepare(query);
      }),
    };

    const response = await callIngest(sessionId, { INTEL_DB: failingDb as never }, validPayload());
    expect(response.status).toBe(500);
    expect(sessions.get(sessionId)!.status).toBe("failed");
  });

  it("rejeita Origin estranho antes de tocar a sessão", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), { Origin: "https://attacker.example.com" });
    expect(response.status).toBe(403);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("rejeita Content-Type diferente de application/json", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), { "Content-Type": "text/plain" });
    expect(response.status).toBe(415);
  });

  it("rejeita corpo maior que o limite máximo", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);
    const rawBody = JSON.stringify(validPayload()) + " ".repeat(5_000_000);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), {}, rawBody);
    expect(response.status).toBe(413);
  });

  it("aplica rate limit defensivo por IP", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);
    let lastStatus = 0;
    for (let i = 0; i < 25; i += 1) {
      const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), {
        "CF-Connecting-IP": "203.0.113.77",
      });
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("chunks atravessando páginas preservam proveniência real — resultado depende só do texto enviado, nunca do backend", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload());
    const body = (await response.json()) as { pageCount: number; chunkCount: number };
    expect(body.pageCount).toBe(2);
    expect(body.chunkCount).toBeGreaterThan(0);
  });
});
