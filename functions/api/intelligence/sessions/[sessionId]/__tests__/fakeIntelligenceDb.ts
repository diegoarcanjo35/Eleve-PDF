import { generateSessionCapability, hashCapability } from "../../../../../_shared/sessionCapability";

/** Fake D1 compartilhado por ingest.test.ts, retrieve.test.ts e ask.test.ts
 * (Sprint 01E.1) — unifica os três fakes ad-hoc anteriores (cada endpoint
 * tinha o seu) num só, já que os três agora precisam das MESMAS operações:
 * máquina de estados de sessão (`.run()`), leitura de sessão/chunk
 * (`.first()`), e o novo upsert condicional de rate limit distribuído
 * (`.run()`). Interpreta as queries exatas usadas por
 * `functions/_shared/intelligenceDb.ts` e
 * `functions/_shared/distributedRateLimit.ts` o suficiente para exercitar
 * de verdade as transições/atomicidade, sem depender de infraestrutura D1
 * real. */

export interface FakeSessionRow {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  page_count: number | null;
  chunk_count: number | null;
  strategy_version: string | null;
  vector_count: number | null;
  embedding_strategy_version: string | null;
  ready_at: string | null;
  capability_hash: string | null;
}

export interface FakeChunkRow {
  id: string;
  session_id: string;
  chunk_index: number;
  text: string;
  start_page: number;
  end_page: number;
  pages_json: string;
  strategy_version: string;
}

interface FakeRateLimitRow {
  count: number;
  windowStart: string;
  updatedAt: string;
}

export function makeFakeIntelligenceDb() {
  const sessions = new Map<string, FakeSessionRow>();
  const chunks = new Map<string, FakeChunkRow>();
  const insertedChunks: unknown[][] = [];
  const rateLimitWindows = new Map<string, FakeRateLimitRow>();

  const db = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (query.includes("INSERT INTO intelligence_sessions")) {
                const [id, createdAt, expiresAt, capabilityHash] = values as [string, string, string, string];
                sessions.set(id, {
                  id,
                  status: "created",
                  created_at: createdAt,
                  expires_at: expiresAt,
                  page_count: null,
                  chunk_count: null,
                  strategy_version: null,
                  vector_count: null,
                  embedding_strategy_version: null,
                  ready_at: null,
                  capability_hash: capabilityHash,
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
              if (query.includes("SET status = 'indexing'")) {
                const [id] = values as [string];
                const row = sessions.get(id);
                if (row && row.status === "ingesting") {
                  row.status = "indexing";
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (query.includes("SET status = 'ready'")) {
                const [pageCount, chunkCount, strategyVersion, vectorCount, embeddingStrategyVersion, readyAtIso, id] =
                  values as [number, number, string, number, string, string, string];
                const row = sessions.get(id);
                if (row && row.status === "indexing") {
                  row.status = "ready";
                  row.page_count = pageCount;
                  row.chunk_count = chunkCount;
                  row.strategy_version = strategyVersion;
                  row.vector_count = vectorCount;
                  row.embedding_strategy_version = embeddingStrategyVersion;
                  row.ready_at = readyAtIso;
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (query.includes("SET status = 'failed'")) {
                const [id] = values as [string];
                const row = sessions.get(id);
                if (row && (row.status === "ingesting" || row.status === "indexing")) {
                  row.status = "failed";
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (query.includes("INSERT INTO intelligence_chunks")) {
                insertedChunks.push(values);
                return { meta: { changes: 1 } };
              }
              if (query.includes("INSERT INTO intelligence_rate_limit_windows")) {
                const [rateKey, windowStart, updatedAt, maxRequests] = values as [string, string, string, number];
                const existing = rateLimitWindows.get(rateKey);
                if (!existing) {
                  rateLimitWindows.set(rateKey, { count: 1, windowStart, updatedAt });
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
            async first<T>() {
              if (query.includes("SELECT id, status, created_at, expires_at")) {
                const [id] = values as [string];
                return (sessions.get(id) ?? null) as T | null;
              }
              if (query.includes("SELECT id, session_id, chunk_index, text")) {
                const [id] = values as [string];
                return (chunks.get(id) ?? null) as T | null;
              }
              throw new Error(`fakeDb.first: query não tratada: ${query}`);
            },
          };
        },
      };
    },
  };

  return { db, sessions, chunks, insertedChunks, rateLimitWindows };
}

export function seedSession(sessions: Map<string, FakeSessionRow>, overrides: Partial<FakeSessionRow> = {}): string {
  const id = overrides.id ?? "11111111-1111-4111-8111-111111111111";
  sessions.set(id, {
    id,
    status: "created",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    page_count: null,
    chunk_count: null,
    strategy_version: null,
    vector_count: null,
    embedding_strategy_version: null,
    ready_at: null,
    capability_hash: null,
    ...overrides,
  });
  return id;
}

/** Semeia uma sessão JÁ AUTORIZADA — gera uma capability real (mesma função
 * de produção), guarda só o hash (mesmo contrato de produção), e devolve a
 * capability em texto puro para o teste montar o header `Authorization`. */
export async function seedAuthorizedSession(
  sessions: Map<string, FakeSessionRow>,
  overrides: Partial<FakeSessionRow> = {},
): Promise<{ sessionId: string; capability: string }> {
  const capability = generateSessionCapability();
  const capabilityHash = await hashCapability(capability);
  const sessionId = seedSession(sessions, { capability_hash: capabilityHash, ...overrides });
  return { sessionId, capability };
}

export function seedChunk(
  chunks: Map<string, FakeChunkRow>,
  sessionId: string,
  index: number,
  text: string,
  pages: number[],
) {
  const id = `${sessionId}:${index}`;
  chunks.set(id, {
    id,
    session_id: sessionId,
    chunk_index: index,
    text,
    start_page: pages[0]!,
    end_page: pages[pages.length - 1]!,
    pages_json: JSON.stringify(pages),
    strategy_version: "v1",
  });
  return id;
}

export function authHeader(capability: string): { Authorization: string } {
  return { Authorization: `Bearer ${capability}` };
}

/** Secret sintético, só de teste — NUNCA um segredo real, nunca commitado
 * fora deste arquivo de teste (ver item 9 do prompt da Sprint 01E.1). */
export const TEST_HMAC_SECRET = "test-only-hmac-secret-01e1-never-a-real-cloudflare-secret";
