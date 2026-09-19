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

describe("ingestExtractedDocument", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-abc", status: "created", expiresAt: "2026-01-01T00:00:00.000Z" }), {
          status: 201,
        }),
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("lança quando a criação de sessão falha", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(createIntelligenceSession()).rejects.toThrow();
  });
});
