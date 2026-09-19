import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIntelligenceSession, ingestExtractedDocument, toIngestionPayload } from "../intelligenceIngestClient";
import type { ExtractedDocument } from "../pdfExtractText";
import { INGESTION_CONTRACT_VERSION } from "@shared/intelligence/constants";

function makeExtractedDocument(): ExtractedDocument {
  return {
    pageCount: 2,
    overallStatus: "ok",
    pages: [
      {
        pageNumber: 1,
        status: "text",
        pageSize: { width: 612, height: 792 },
        blocks: [{ text: "Primeira página.", boundingBox: { x: 0, y: 0, width: 100, height: 10 } }],
      },
      {
        pageNumber: 2,
        status: "text",
        pageSize: { width: 612, height: 792 },
        blocks: [{ text: "Segunda página.", boundingBox: { x: 0, y: 0, width: 100, height: 10 } }],
      },
    ],
  };
}

describe("toIngestionPayload", () => {
  it("mapeia ExtractedDocument para o contrato de fio, sem bounding box, sem PDF, sem nome de arquivo", () => {
    const payload = toIngestionPayload(makeExtractedDocument());
    expect(payload).toEqual({
      contractVersion: INGESTION_CONTRACT_VERSION,
      pageCount: 2,
      pages: [
        { pageNumber: 1, blocks: [{ text: "Primeira página." }] },
        { pageNumber: 2, blocks: [{ text: "Segunda página." }] },
      ],
    });
    expect(JSON.stringify(payload)).not.toMatch(/boundingBox|pdf|fileName/i);
  });
});

const FAKE_CAPABILITY = "fake-capability-nunca-real-DEADBEEFCAFE1234567890ABCDEFxyz";

function mockCreateThenIngest(overrides: { sessionCapability?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sessionId: "session-abc",
          sessionCapability: FAKE_CAPABILITY,
          status: "created",
          expiresAt: "2026-01-01T00:00:00.000Z",
          ...overrides,
        }),
        { status: 201 },
      ),
    ).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sessionId: "session-abc",
          status: "ready",
          pageCount: 2,
          chunkCount: 1,
          expiresAt: "2026-01-01T00:00:00.000Z",
          chunkingStrategyVersion: "v1-natural-break-char-target",
        }),
        { status: 200 },
      ),
    ),
  );
}

describe("ingestExtractedDocument", () => {
  beforeEach(() => {
    mockCreateThenIngest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1. cria a sessão e captura sessionCapability", async () => {
    const session = await createIntelligenceSession();
    expect(session.sessionCapability).toBe(FAKE_CAPABILITY);
  });

  it("cria a sessão e depois envia a ingestão para essa mesma sessão", async () => {
    const result = await ingestExtractedDocument(makeExtractedDocument());

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    const [sessionUrl, sessionInit] = calls[0] as [string, RequestInit];
    const [ingestUrl, ingestInit] = calls[1] as [string, RequestInit];
    expect(sessionUrl).toBe("/api/intelligence/sessions");
    expect(sessionInit.method).toBe("POST");
    expect(ingestUrl).toBe("/api/intelligence/sessions/session-abc/ingest");
    const sentBody = JSON.parse(ingestInit.body as string);
    expect(sentBody.pageCount).toBe(2);

    expect(result.status).toBe("ready");
    expect(result.chunkCount).toBe(1);
  });

  it("2. envia a capability correta no header Authorization do ingest", async () => {
    await ingestExtractedDocument(makeExtractedDocument());

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [, ingestInit] = calls[1] as [string, RequestInit];
    const headers = new Headers(ingestInit.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${FAKE_CAPABILITY}`);
  });

  it("5. capability nunca aparece na URL de nenhuma das duas chamadas", async () => {
    await ingestExtractedDocument(makeExtractedDocument());

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    for (const call of calls) {
      const [url] = call as [string, RequestInit];
      expect(url).not.toContain(FAKE_CAPABILITY);
    }
  });

  it("6. este módulo nunca importa nem chama o domínio de Analytics — capability não tem como vazar para lá", () => {
    // Auditoria por leitura direta do código-fonte (não só do comportamento
    // observado em runtime): nenhum `import` de um módulo de analytics, e
    // nenhuma URL de fetch para /api/analytics — a menção a "Analytics" que
    // aparece nos comentários (documentando a garantia) não conta como
    // acoplamento real, por isso o filtro abaixo ignora linhas de comentário.
    const source = readFileSync(join(__dirname, "..", "intelligenceIngestClient.ts"), "utf-8");
    const codeOnly = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//") && !line.trim().startsWith("/**"))
      .join("\n");
    expect(codeOnly.toLowerCase()).not.toContain("analytics");
  });

  it("7. capability nunca é escrita em localStorage/sessionStorage", async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

    await ingestExtractedDocument(makeExtractedDocument());

    for (const call of localStorageSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(FAKE_CAPABILITY);
    }
    // Nenhuma chamada a setItem deveria sequer ter ocorrido: este módulo não
    // persiste nada — a capability vive só como variável local da chamada.
    expect(localStorageSpy).not.toHaveBeenCalled();
    localStorageSpy.mockRestore();
  });

  it("8. sessão criada sem sessionCapability: recusa local, nunca tenta ingest usando só sessionId", async () => {
    vi.unstubAllGlobals();
    // Resposta de criação sem `sessionCapability` de propósito (contrato divergente).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-sem-capability", status: "created", expiresAt: "2026-01-01T00:00:00.000Z" }), {
          status: 201,
        }),
      ),
    );

    await expect(ingestExtractedDocument(makeExtractedDocument())).rejects.toThrow(/capability/i);

    // Só a chamada de criação aconteceu — nunca uma segunda chamada ao ingest.
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
  });

  it("9. mensagem de erro de falha na ingestão nunca contém a capability", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ sessionId: "session-abc", sessionCapability: FAKE_CAPABILITY, status: "created", expiresAt: "2026-01-01T00:00:00.000Z" }),
          { status: 201 },
        ),
      ).mockResolvedValueOnce(new Response(null, { status: 401 })),
    );

    let caughtError: unknown;
    try {
      await ingestExtractedDocument(makeExtractedDocument());
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect(String(caughtError)).not.toContain(FAKE_CAPABILITY);
  });

  it("lança quando a criação de sessão falha", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(createIntelligenceSession()).rejects.toThrow();
  });
});
