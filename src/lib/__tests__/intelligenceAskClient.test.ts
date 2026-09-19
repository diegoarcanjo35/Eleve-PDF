import { afterEach, describe, expect, it, vi } from "vitest";
import { askQuestion } from "../intelligenceAskClient";
import { ASK_CONTRACT_VERSION } from "@shared/intelligence/constants";

const FAKE_CAPABILITY = "fake-capability-nunca-real-0123456789ABCDEFxyz";

function mockFetchSuccess(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

describe("askQuestion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("6. envia Authorization: Bearer <capability> e o contrato correto", async () => {
    mockFetchSuccess({
      sessionId: "session-1",
      answer: "resposta",
      insufficientEvidence: false,
      evidence: [],
      indexStatus: "settled",
    });

    await askQuestion("session-1", FAKE_CAPABILITY, "Quem assina o contrato?");

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe("/api/intelligence/sessions/session-1/ask");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${FAKE_CAPABILITY}`);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ contractVersion: ASK_CONTRACT_VERSION, question: "Quem assina o contrato?" });
  });

  it("13. capability nunca aparece na URL", async () => {
    mockFetchSuccess({ sessionId: "s", answer: "x", insufficientEvidence: false, evidence: [], indexStatus: "settled" });
    await askQuestion("session-1", FAKE_CAPABILITY, "pergunta");
    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(FAKE_CAPABILITY);
  });

  it("9. resposta normal (kind: answer) com evidência real é devolvida", async () => {
    mockFetchSuccess({
      sessionId: "s",
      answer: "A resposta é 42.",
      insufficientEvidence: false,
      evidence: [{ evidenceId: "E1", chunkId: "s:0", pages: [7], startPage: 7, endPage: 7 }],
      indexStatus: "settled",
    });
    const result = await askQuestion("session-1", FAKE_CAPABILITY, "pergunta");
    expect(result.kind).toBe("answer");
    if (result.kind === "answer") {
      expect(result.data.answer).toBe("A resposta é 42.");
      expect(result.data.evidence[0]!.startPage).toBe(7);
    }
  });

  it("10. insufficientEvidence é preservado, nunca convertido em resposta confirmada", async () => {
    mockFetchSuccess({
      sessionId: "s",
      answer: null,
      insufficientEvidence: true,
      evidence: [],
      indexStatus: "settled",
    });
    const result = await askQuestion("session-1", FAKE_CAPABILITY, "pergunta");
    expect(result.kind).toBe("answer");
    if (result.kind === "answer") {
      expect(result.data.insufficientEvidence).toBe(true);
      expect(result.data.answer).toBeNull();
    }
  });

  it("202 possibly_propagating vira kind: propagating, sem tratar como erro", async () => {
    mockFetchSuccess({ sessionId: "s", status: "possibly_propagating" }, 202);
    const result = await askQuestion("session-1", FAKE_CAPABILITY, "pergunta");
    expect(result.kind).toBe("propagating");
  });

  it("16. lança um erro controlado quando a resposta não é ok, sem revelar a capability", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    let caught: unknown;
    try {
      await askQuestion("session-1", FAKE_CAPABILITY, "pergunta");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).not.toContain(FAKE_CAPABILITY);
  });
});
