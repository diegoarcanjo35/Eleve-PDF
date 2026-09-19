import { afterEach, describe, expect, it, vi } from "vitest";
import { retrieveChunks } from "../intelligenceRetrieveClient";
import { RETRIEVAL_CONTRACT_VERSION } from "@shared/intelligence/constants";

const FAKE_CAPABILITY = "fake-capability-nunca-real-0123456789ABCDEFxyz";

function mockFetchSuccess(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

describe("retrieveChunks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("5. envia Authorization: Bearer <capability> e o contrato correto", async () => {
    mockFetchSuccess({ sessionId: "session-1", results: [], indexStatus: "settled" });

    await retrieveChunks("session-1", FAKE_CAPABILITY, "pergunta de teste");

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe("/api/intelligence/sessions/session-1/retrieve");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${FAKE_CAPABILITY}`);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ contractVersion: RETRIEVAL_CONTRACT_VERSION, query: "pergunta de teste" });
  });

  it("13. capability nunca aparece na URL", async () => {
    mockFetchSuccess({ sessionId: "session-1", results: [], indexStatus: "settled" });
    await retrieveChunks("session-1", FAKE_CAPABILITY, "pergunta");
    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(FAKE_CAPABILITY);
  });

  it("11. resultados reais (chunks/páginas) são devolvidos sem alteração", async () => {
    mockFetchSuccess({
      sessionId: "session-1",
      results: [{ chunkId: "session-1:0", text: "conteúdo", score: 0.9, pages: [3], startPage: 3, endPage: 3 }],
      indexStatus: "settled",
    });
    const result = await retrieveChunks("session-1", FAKE_CAPABILITY, "pergunta");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.startPage).toBe(3);
  });

  it("lança um erro controlado quando a resposta não é ok, sem revelar a capability", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    let caught: unknown;
    try {
      await retrieveChunks("session-1", FAKE_CAPABILITY, "pergunta");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).not.toContain(FAKE_CAPABILITY);
  });
});
