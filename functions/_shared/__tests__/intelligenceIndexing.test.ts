import { describe, expect, it, vi } from "vitest";
import { buildVectorId, embedTexts, upsertChunkVectors } from "../intelligenceIndexing";
import { EMBEDDING_BATCH_SIZE, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../../../shared/intelligence/constants";
import type { DocumentChunk } from "../../../shared/intelligence/types";

function makeFakeAi(overrides?: { run?: ReturnType<typeof vi.fn> }) {
  const run =
    overrides?.run ??
    vi.fn(async (_model: string, input: { text: string | string[] }) => {
      const texts = Array.isArray(input.text) ? input.text : [input.text];
      return { data: texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0.5)), shape: [texts.length, EMBEDDING_DIMENSIONS] };
    });
  return { run } as unknown as Ai;
}

function makeChunk(overrides: Partial<DocumentChunk> = {}): DocumentChunk {
  return {
    index: 0,
    text: "texto do chunk",
    startPage: 1,
    endPage: 1,
    pages: [1],
    chunkingStrategyVersion: "v1-test",
    pageSpans: [{ page: 1, startOffset: 0, endOffset: "texto do chunk".length }],
    ...overrides,
  };
}

describe("buildVectorId", () => {
  it("é determinístico e usa o mesmo esquema do ID de chunk no D1", () => {
    expect(buildVectorId("session-abc", 3)).toBe("session-abc:3");
  });

  it("nunca é o texto integral nem depende de nome de arquivo", () => {
    const id = buildVectorId("11111111-1111-4111-8111-111111111111", 0);
    expect(id).not.toMatch(/\.pdf/i);
    expect(id.length).toBeLessThan(100);
  });
});

describe("embedTexts", () => {
  it("lista vazia retorna zero vetores e zero lotes sem chamar a IA", async () => {
    const ai = makeFakeAi();
    const result = await embedTexts(ai, []);
    expect(result).toEqual({ vectors: [], batches: 0 });
    expect((ai.run as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("quantidade de embeddings retornados é igual à quantidade de textos enviados", async () => {
    const ai = makeFakeAi();
    const texts = ["a", "b", "c"];
    const result = await embedTexts(ai, texts);
    expect(result.vectors).toHaveLength(texts.length);
    for (const v of result.vectors) expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("faz batching: mais textos que EMBEDDING_BATCH_SIZE geram múltiplas chamadas, cada uma com um lote", async () => {
    const ai = makeFakeAi();
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE * 2 + 3 }, (_, i) => `texto ${i}`);
    const result = await embedTexts(ai, texts);

    const calls = (ai.run as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(3); // 2 lotes cheios + 1 lote residual
    expect(result.batches).toBe(3);
    expect(result.vectors).toHaveLength(texts.length);
    for (const call of calls) {
      expect(call[0]).toBe(EMBEDDING_MODEL);
      const input = call[1] as { text: string[] };
      expect(input.text.length).toBeLessThanOrEqual(EMBEDDING_BATCH_SIZE);
    }
  });

  it("lança se a resposta do modelo não tiver o formato esperado (nunca aceita silenciosamente)", async () => {
    const ai = makeFakeAi({ run: vi.fn().mockResolvedValue({ response: [{ id: 0, score: 0.9 }] }) });
    await expect(embedTexts(ai, ["texto"])).rejects.toThrow();
  });

  it("lança se a contagem de embeddings não bater com o lote enviado", async () => {
    const ai = makeFakeAi({ run: vi.fn().mockResolvedValue({ data: [new Array(EMBEDDING_DIMENSIONS).fill(0)] }) });
    await expect(embedTexts(ai, ["um", "dois"])).rejects.toThrow();
  });

  it("lança se um vetor retornado não tiver a dimensionalidade esperada", async () => {
    const ai = makeFakeAi({ run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }) });
    await expect(embedTexts(ai, ["texto"])).rejects.toThrow();
  });
});

describe("upsertChunkVectors", () => {
  it("um vetor por chunk, com ID determinístico e metadata sem texto do chunk", async () => {
    const upserted: unknown[] = [];
    const vectorize = {
      upsert: vi.fn(async (vectors: unknown[]) => {
        upserted.push(...vectors);
        return { mutationId: "mut-1" };
      }),
    } as unknown as Vectorize;

    const chunks = [makeChunk({ index: 0, text: "segredo do documento A" }), makeChunk({ index: 1, text: "segredo do documento B" })];
    const embeddings = chunks.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0.1));

    const result = await upsertChunkVectors(vectorize, "session-xyz", chunks, embeddings, "v1-embed-test");

    expect(result.vectorCount).toBe(2);
    expect(upserted).toHaveLength(2);
    const vectors = upserted as { id: string; values: number[]; metadata: Record<string, unknown> }[];
    expect(vectors[0]!.id).toBe("session-xyz:0");
    expect(vectors[1]!.id).toBe("session-xyz:1");
    for (const v of vectors) {
      expect(JSON.stringify(v.metadata)).not.toContain("segredo do documento");
      expect(v.metadata.sessionId).toBe("session-xyz");
      expect(v.metadata.embeddingStrategyVersion).toBe("v1-embed-test");
    }
  });

  it("lança se a quantidade de chunks e embeddings não corresponder", async () => {
    const vectorize = { upsert: vi.fn() } as unknown as Vectorize;
    await expect(upsertChunkVectors(vectorize, "s1", [makeChunk()], [], "v1")).rejects.toThrow();
  });

  it("lista vazia de chunks não chama o Vectorize", async () => {
    const upsert = vi.fn();
    const vectorize = { upsert } as unknown as Vectorize;
    const result = await upsertChunkVectors(vectorize, "s1", [], [], "v1");
    expect(result).toEqual({ mutationId: "", vectorCount: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });
});
