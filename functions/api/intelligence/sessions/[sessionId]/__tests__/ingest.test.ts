import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../ingest";
import { __resetRateLimitStateForTests } from "../../../../../_shared/rateLimit";
import {
  INGESTION_CONTRACT_VERSION,
  CHUNKING_STRATEGY_VERSION,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_STRATEGY_VERSION,
} from "../../../../../../shared/intelligence/constants";
import {
  authHeader,
  makeFakeIntelligenceDb,
  seedAuthorizedSession,
  seedSession,
  TEST_HMAC_SECRET,
} from "./fakeIntelligenceDb";

const VALID_ORIGIN = "https://elevepdf.elevesites.com.br";
const VALID_HOST = "elevepdf.elevesites.com.br";

/** Fake do binding Workers AI — devolve embeddings determinísticos com a
 * dimensionalidade real (1024), sem nenhuma chamada de rede. */
function makeFakeAi() {
  const run = vi.fn(async (_model: string, input: { text: string | string[] }) => {
    const texts = Array.isArray(input.text) ? input.text : [input.text];
    return { data: texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0.01)), shape: [texts.length, EMBEDDING_DIMENSIONS] };
  });
  return { run } as unknown as Ai;
}

/** Fake do binding Vectorize — só registra os vetores upsertados em memória;
 * suficiente para testar o contrato (ID, metadata) sem infraestrutura real. */
function makeFakeVectorize() {
  const upserted: VectorizeVector[] = [];
  const upsert = vi.fn(async (vectors: VectorizeVector[]) => {
    upserted.push(...vectors);
    return { mutationId: "fake-mutation-id" };
  });
  return { vectorize: { upsert } as unknown as Vectorize, upserted };
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

function callIngest(
  sessionId: string,
  env: { INTEL_DB: unknown; AI?: unknown; VECTORIZE?: unknown; RATE_LIMIT_HMAC_KEY?: string },
  body: unknown,
  overrides?: Partial<Record<string, string>>,
  rawBody?: string,
) {
  return onRequestPost({
    request: makeRequest(sessionId, body, overrides, rawBody),
    env: {
      AI: makeFakeAi(),
      VECTORIZE: makeFakeVectorize().vectorize,
      RATE_LIMIT_HMAC_KEY: TEST_HMAC_SECRET,
      ELEVE_IA_ENABLED: "true",
      ...env,
    },
    params: { sessionId },
  } as never);
}

describe("POST /api/intelligence/sessions/:sessionId/ingest", () => {
  beforeEach(() => {
    __resetRateLimitStateForTests();
  });

  it("ingestão válida: chunka, persiste, marca a sessão ready, e não ecoa o texto na resposta", async () => {
    const { db, sessions, insertedChunks } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);

    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability));
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ sessionId, status: "ready", pageCount: 2, chunkCount: expect.any(Number) });
    expect(body.chunkingStrategyVersion).toBe(CHUNKING_STRATEGY_VERSION);

    const rawResponseText = JSON.stringify(body);
    expect(rawResponseText).not.toContain("Conteúdo real da página");

    expect(sessions.get(sessionId)!.status).toBe("ready");
    expect(insertedChunks.length).toBeGreaterThan(0);
  });

  it("Sprint 01H — feature flag desligada: 404, zero chamadas a AI/Vectorize/D1, mesmo com sessão e capability válidas", async () => {
    const { db, sessions, insertedChunks } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const ai = makeFakeAi();
    const { vectorize, upserted } = makeFakeVectorize();

    const response = await callIngest(
      sessionId,
      { INTEL_DB: db as never, AI: ai, VECTORIZE: vectorize, ELEVE_IA_ENABLED: "false" } as never,
      validPayload(),
      authHeader(capability),
    );

    expect(response.status).toBe(404);
    expect(ai.run).not.toHaveBeenCalled();
    expect(upserted).toHaveLength(0);
    expect(insertedChunks).toHaveLength(0);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("sessão inexistente: 401 (mesma resposta genérica de autorização — nunca revela que a sessão não existe)", async () => {
    const { db } = makeFakeIntelligenceDb();
    const response = await callIngest("00000000-0000-4000-8000-000000000000", { INTEL_DB: db as never }, validPayload());
    expect(response.status).toBe(401);
  });

  it("4. ingest sem capability (header Authorization ausente): bloqueado (401)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId } = await seedAuthorizedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload());
    expect(response.status).toBe(401);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("7. capability incorreta: bloqueado (401), sessão permanece intocada", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId } = await seedAuthorizedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader("capability-errada-qualquer-coisa"));
    expect(response.status).toBe(401);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("9. sessão legada sem capability_hash (null): sempre bloqueada, sem fallback para sessionId sozinho", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const sessionId = seedSession(sessions); // capability_hash: null por padrão
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader("qualquer-valor"));
    expect(response.status).toBe(401);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("sessão expirada não permite ingestão (falha determinística)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions, {
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability));
    expect(response.status).toBe(410);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("payload inválido: rejeita e libera a sessão para retry (não fica presa em ingesting)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const response = await callIngest(
      sessionId,
      { INTEL_DB: db as never },
      { contractVersion: INGESTION_CONTRACT_VERSION, pageCount: 5, pages: [] },
      authHeader(capability),
    );
    expect(response.status).toBe(400);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("JSON malformado retorna 400 sem lançar e libera a sessão", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, null, authHeader(capability), "{ isso não é json");
    expect(response.status).toBe(400);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("segunda ingestão na mesma sessão (já ready) é rejeitada com 409, sem reprocessar", async () => {
    const { db, sessions, insertedChunks } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);

    const first = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability));
    expect(first.status).toBe(200);
    const chunksAfterFirst = insertedChunks.length;

    const second = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability));
    expect(second.status).toBe(409);
    expect(insertedChunks.length).toBe(chunksAfterFirst);
  });

  it("duas ingestões concorrentes na mesma sessão: só uma consegue avançar (estado guardado atomicamente)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);

    const [first, second] = await Promise.all([
      callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability)),
      callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability)),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("falha durante o chunking/persistência marca a sessão failed, nunca ready", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);

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

    const response = await callIngest(sessionId, { INTEL_DB: failingDb as never }, validPayload(), authHeader(capability));
    expect(response.status).toBe(500);
    expect(sessions.get(sessionId)!.status).toBe("failed");
  });

  it("rejeita Origin estranho antes de tocar a sessão", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), {
      Origin: "https://attacker.example.com",
      ...authHeader(capability),
    });
    expect(response.status).toBe(403);
    expect(sessions.get(sessionId)!.status).toBe("created");
  });

  it("rejeita Content-Type diferente de application/json", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), {
      "Content-Type": "text/plain",
      ...authHeader(capability),
    });
    expect(response.status).toBe(415);
  });

  it("rejeita corpo maior que o limite máximo", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const rawBody = JSON.stringify(validPayload()) + " ".repeat(5_000_000);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability), rawBody);
    expect(response.status).toBe(413);
  });

  it("aplica rate limit defensivo em memória por IP", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    let lastStatus = 0;
    for (let i = 0; i < 25; i += 1) {
      const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), {
        "CF-Connecting-IP": "203.0.113.77",
        ...authHeader(capability),
      });
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("18. falha do D1 no rate limit distribuído: ingest fail-closed (503), nunca chama Workers AI/Vectorize", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const ai = makeFakeAi();
    const { vectorize, upserted } = makeFakeVectorize();

    const response = await callIngest(
      sessionId,
      { INTEL_DB: db as never, AI: ai, VECTORIZE: vectorize, RATE_LIMIT_HMAC_KEY: undefined },
      validPayload(),
      authHeader(capability),
    );
    expect(response.status).toBe(503);
    expect(sessions.get(sessionId)!.status).toBe("created");
    expect((ai.run as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(upserted).toHaveLength(0);
  });

  it("chunks atravessando páginas preservam proveniência real — resultado depende só do texto enviado, nunca do backend", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability));
    const body = (await response.json()) as { pageCount: number; chunkCount: number };
    expect(body.pageCount).toBe(2);
    expect(body.chunkCount).toBeGreaterThan(0);
  });

  it("quantidade de embeddings gerados é igual à quantidade de chunks, e cada vetor upsertado tem ID/metadata determinísticos", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const ai = makeFakeAi();
    const { vectorize, upserted } = makeFakeVectorize();

    const response = await callIngest(
      sessionId,
      { INTEL_DB: db as never, AI: ai, VECTORIZE: vectorize },
      validPayload(),
      authHeader(capability),
    );
    const body = (await response.json()) as { chunkCount: number; vectorCount: number };

    expect(response.status).toBe(200);
    expect(upserted.length).toBe(body.chunkCount);
    expect(body.vectorCount).toBe(body.chunkCount);

    for (const vector of upserted) {
      expect(vector.id).toMatch(new RegExp(`^${sessionId}:\\d+$`));
      expect(vector.id).toBe(`${sessionId}:${vector.metadata!.chunkId!.toString().split(":")[1]}`);
      expect(vector.metadata).toMatchObject({
        sessionId,
        embeddingStrategyVersion: EMBEDDING_STRATEGY_VERSION,
        chunkingStrategyVersion: CHUNKING_STRATEGY_VERSION,
      });
      expect(vector.values).toHaveLength(EMBEDDING_DIMENSIONS);
      // Metadata nunca carrega o texto do chunk — só o D1 é fonte do texto.
      expect(JSON.stringify(vector.metadata)).not.toContain("Conteúdo real da página");
    }

    expect(sessions.get(sessionId)!.vector_count).toBe(body.chunkCount);
    expect(sessions.get(sessionId)!.embedding_strategy_version).toBe(EMBEDDING_STRATEGY_VERSION);
  });

  it("batching: chunks são enviados ao modelo em lotes, não um-a-um", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const ai = makeFakeAi();

    // Documento maior, força múltiplos chunks (bem acima de EMBEDDING_BATCH_SIZE=20 blocos).
    const pages = Array.from({ length: 40 }, (_, i) => ({
      pageNumber: i + 1,
      blocks: [{ text: `Página ${i + 1} com conteúdo suficientemente longo para formar blocos distintos no chunking.` }],
    }));
    const payload = { contractVersion: INGESTION_CONTRACT_VERSION, pageCount: 40, pages };

    const response = await callIngest(sessionId, { INTEL_DB: db as never, AI: ai }, payload, authHeader(capability));
    expect(response.status).toBe(200);
    // Menos chamadas a env.AI.run() do que chunks — prova que há batching real.
    const runCalls = (ai.run as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const body = (await response.json()) as { chunkCount: number };
    expect(runCalls).toBeGreaterThan(0);
    expect(runCalls).toBeLessThanOrEqual(body.chunkCount);
  });

  it("falha do Workers AI (embedding) marca a sessão failed, nunca ready, e não chama o Vectorize", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const failingAi = { run: vi.fn().mockRejectedValue(new Error("Workers AI indisponível")) } as unknown as Ai;
    const { vectorize, upserted } = makeFakeVectorize();

    const response = await callIngest(
      sessionId,
      { INTEL_DB: db as never, AI: failingAi, VECTORIZE: vectorize },
      validPayload(),
      authHeader(capability),
    );
    expect(response.status).toBe(500);
    expect(sessions.get(sessionId)!.status).toBe("failed");
    expect(upserted).toHaveLength(0);
  });

  it("falha do Vectorize (upsert) marca a sessão failed, nunca ready", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const failingVectorize = { upsert: vi.fn().mockRejectedValue(new Error("Vectorize indisponível")) } as unknown as Vectorize;

    const response = await callIngest(
      sessionId,
      { INTEL_DB: db as never, VECTORIZE: failingVectorize },
      validPayload(),
      authHeader(capability),
    );
    expect(response.status).toBe(500);
    expect(sessions.get(sessionId)!.status).toBe("failed");
  });

  it("sessão nunca fica ready se a transição para indexing falhar (estado inconsistente evitado)", async () => {
    const { sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    // DB cujo "SET status = 'indexing'" nunca aplica (simula uma corrida/estado já alterado).
    const stubbornDb = {
      prepare: vi.fn((query: string) => ({
        bind: (...values: unknown[]) => ({
          async run() {
            if (query.includes("INSERT INTO intelligence_sessions")) return { meta: { changes: 1 } };
            if (query.includes("SET status = 'ingesting'")) return { meta: { changes: 1 } };
            if (query.includes("SET status = 'indexing'")) return { meta: { changes: 0 } };
            if (query.includes("INSERT INTO intelligence_chunks")) return { meta: { changes: 1 } };
            if (query.includes("INSERT INTO intelligence_rate_limit_windows")) return { meta: { changes: 1 } };
            if (query.includes("SET status = 'failed'")) {
              const [id] = values as [string];
              const row = sessions.get(id);
              if (row) row.status = "failed";
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
          async first<T>() {
            if (query.includes("SELECT id, status, created_at, expires_at")) {
              const [id] = values as [string];
              return (sessions.get(id) ?? null) as T | null;
            }
            return null;
          },
        }),
      })),
    };
    const response = await callIngest(sessionId, { INTEL_DB: stubbornDb as never }, validPayload(), authHeader(capability));
    expect(response.status).toBe(500);
    expect(sessions.get(sessionId)!.status).toBe("failed");
  });

  it("11. nenhum log de telemetria contém texto de chunk, conteúdo do documento, ou a capability", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader(capability));

    for (const call of consoleSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain("Conteúdo real da página");
      expect(serialized).not.toContain(capability);
    }
    consoleSpy.mockRestore();
  });

  it("10. capability nunca aparece em nenhuma resposta de erro (corpo vazio)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const response = await callIngest(sessionId, { INTEL_DB: db as never }, validPayload(), authHeader("capability-errada"));
    expect(response.status).toBe(401);
    const text = await response.text();
    expect(text).toBe("");
    expect(text).not.toContain(capability);
  });

  it("nenhuma chamada é feita a OpenAI/Luna — só ao binding Workers AI local (fake)", async () => {
    const { db, sessions } = makeFakeIntelligenceDb();
    const { sessionId, capability } = await seedAuthorizedSession(sessions);
    const ai = makeFakeAi();

    await callIngest(sessionId, { INTEL_DB: db as never, AI: ai }, validPayload(), authHeader(capability));

    for (const call of (ai.run as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toBe("@cf/baai/bge-m3");
    }
  });
});
