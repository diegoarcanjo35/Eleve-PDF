import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useIntelligenceSession } from "../useIntelligenceSession";

const validateMock = vi.fn();
const extractMock = vi.fn();
const ingestMock = vi.fn();
const askMock = vi.fn();

vi.mock("@/lib/pdfWorkerClient", () => ({
  requestValidate: (...args: unknown[]) => validateMock(...args),
  requestExtractText: (...args: unknown[]) => extractMock(...args),
}));

vi.mock("@/lib/intelligenceIngestClient", () => ({
  ingestExtractedDocument: (...args: unknown[]) => ingestMock(...args),
}));

vi.mock("@/lib/intelligenceAskClient", () => ({
  askQuestion: (...args: unknown[]) => askMock(...args),
}));

vi.mock("@/analytics/client", () => ({ track: vi.fn() }));

function makeFile(name = "documento.pdf"): File {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
  // jsdom's Blob não implementa arrayBuffer() por padrão neste projeto (ver src/test/setup.ts polyfill).
  return file;
}

function successfulPipeline(overallStatus: "ok" | "unsupported" = "ok") {
  validateMock.mockReturnValue({ promise: Promise.resolve({ pageCount: 3, structure: {} }) });
  extractMock.mockImplementation((_buffer: ArrayBuffer, onProgress?: (p: { pagesProcessed: number; totalPages: number }) => void) => {
    onProgress?.({ pagesProcessed: 3, totalPages: 3 });
    return {
      promise: Promise.resolve({
        document: { pageCount: 3, pages: [], overallStatus },
      }),
    };
  });
  ingestMock.mockResolvedValue({
    sessionId: "session-abc",
    sessionCapability: "cap-abc",
    status: "ready",
    pageCount: 3,
    chunkCount: 5,
    expiresAt: "2026-01-01T00:00:00.000Z",
    chunkingStrategyVersion: "v1",
  });
}

describe("useIntelligenceSession", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("2. fluxo completo cria a sessão (via ingestExtractedDocument) e chega a 'ready'", async () => {
    successfulPipeline();
    const { result } = renderHook(() => useIntelligenceSession());

    act(() => {
      result.current.handleFileSelected(makeFile());
    });

    await waitFor(() => expect(result.current.stage).toBe("ready"));
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(result.current.pageCount).toBe(3);
  });

  it("3/7. capability fica só em memória — ask() funciona sem o hook nunca expor a capability", async () => {
    successfulPipeline();
    askMock.mockResolvedValue({ kind: "answer", data: { sessionId: "session-abc", answer: "x", insufficientEvidence: false, evidence: [], indexStatus: "settled" } });

    const { result } = renderHook(() => useIntelligenceSession());
    act(() => {
      result.current.handleFileSelected(makeFile());
    });
    await waitFor(() => expect(result.current.stage).toBe("ready"));

    // Nenhuma propriedade pública do hook carrega a capability.
    expect(JSON.stringify(result.current)).not.toContain("cap-abc");

    await act(async () => {
      await result.current.ask("pergunta");
    });
    expect(askMock).toHaveBeenCalledWith("session-abc", "cap-abc", "pergunta");
  });

  it("7. ask() sem sessão pronta lança erro controlado — nunca chama o backend só com sessionId", async () => {
    const { result } = renderHook(() => useIntelligenceSession());
    await expect(result.current.ask("pergunta")).rejects.toThrow();
    expect(askMock).not.toHaveBeenCalled();
  });

  it("8. documento sem texto (overallStatus unsupported) bloqueia o fluxo antes de criar sessão/IA", async () => {
    successfulPipeline("unsupported");
    const { result } = renderHook(() => useIntelligenceSession());

    act(() => {
      result.current.handleFileSelected(makeFile());
    });

    await waitFor(() => expect(result.current.stage).toBe("unsupported"));
    expect(ingestMock).not.toHaveBeenCalled();
    await expect(result.current.ask("pergunta")).rejects.toThrow();
  });

  it("16. falha na criação/ingest vira estado de erro controlado, com mensagem amigável", async () => {
    validateMock.mockReturnValue({ promise: Promise.resolve({ pageCount: 1, structure: {} }) });
    extractMock.mockReturnValue({
      promise: Promise.resolve({ document: { pageCount: 1, pages: [], overallStatus: "ok" } }),
    });
    ingestMock.mockRejectedValue(new Error("Falha ao criar sessão temporária (status 500)."));

    const { result } = renderHook(() => useIntelligenceSession());
    act(() => {
      result.current.handleFileSelected(makeFile());
    });

    await waitFor(() => expect(result.current.stage).toBe("error"));
    expect(result.current.errorMessage).toBeTruthy();
  });

  it("17. uma nova montagem do hook nunca restaura a capability de uma sessão anterior", async () => {
    successfulPipeline();
    const { result, unmount } = renderHook(() => useIntelligenceSession());
    act(() => {
      result.current.handleFileSelected(makeFile());
    });
    await waitFor(() => expect(result.current.stage).toBe("ready"));
    unmount();

    const fresh = renderHook(() => useIntelligenceSession());
    expect(fresh.result.current.stage).toBe("idle");
    await expect(fresh.result.current.ask("pergunta")).rejects.toThrow();
  });
});
