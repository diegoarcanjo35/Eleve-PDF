import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitPdfBySize } from "../pdfSplit";
import { makeTextPdf, makePdfWithJpegImage } from "@/test/pdfFixtures";

describe("splitPdfBySize", () => {
  it("keeps a single small page as one part", async () => {
    const bytes = await makeTextPdf(1);
    const result = await splitPdfBySize(bytes, 5 * 1024 * 1024);
    expect(result.totalPages).toBe(1);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]!.pageIndices).toEqual([0]);
    expect(result.parts[0]!.exceedsLimit).toBe(false);
  });

  it("splits a multi-page PDF into more than one part when the limit is small", async () => {
    const bytes = await makeTextPdf(14, 20);
    const maxBytes = 2500; // pequeno o suficiente para forçar múltiplas partes (medido empiricamente)
    const result = await splitPdfBySize(bytes, maxBytes);

    expect(result.totalPages).toBe(14);
    expect(result.parts.length).toBeGreaterThan(1);

    for (const part of result.parts) {
      expect(part.sizeBytes).toBe(part.bytes.byteLength);
      if (!part.exceedsLimit) {
        expect(part.sizeBytes).toBeLessThanOrEqual(maxBytes);
      }
    }
  });

  it("preserves page order across all parts and never duplicates or drops a page", async () => {
    const bytes = await makeTextPdf(10, 20);
    const result = await splitPdfBySize(bytes, 2500);
    expect(result.parts.length).toBeGreaterThan(1);

    const allIndices = result.parts.flatMap((part) => part.pageIndices);
    expect(allIndices).toEqual([...Array(10).keys()]);
  });

  it("never leaves a part empty and each part's real serialized size matches its byte length", async () => {
    const bytes = await makeTextPdf(8, 15);
    const result = await splitPdfBySize(bytes, 1500);
    expect(result.parts.length).toBeGreaterThan(1);
    for (const part of result.parts) {
      expect(part.pageIndices.length).toBeGreaterThan(0);
      expect(part.bytes.byteLength).toBe(part.sizeBytes);
    }
  });

  it("marks a part as exceeding the limit when a single page alone is larger than the limit, without dropping content", async () => {
    const bytes = await makePdfWithJpegImage(3);
    const tinyLimit = 2 * 1024; // menor do que uma única página com imagem consegue ficar
    const result = await splitPdfBySize(bytes, tinyLimit);

    expect(result.totalPages).toBe(3);
    const oversized = result.parts.filter((part) => part.exceedsLimit);
    expect(oversized.length).toBeGreaterThan(0);
    for (const part of oversized) {
      expect(part.pageIndices).toHaveLength(1);
    }

    const allIndices = result.parts.flatMap((part) => part.pageIndices);
    expect(allIndices).toEqual([0, 1, 2]);
  });

  it("respects a custom limit and each generated part is independently a valid, loadable PDF", async () => {
    const bytes = await makeTextPdf(6, 20);
    const result = await splitPdfBySize(bytes, 10 * 1024);
    for (const part of result.parts) {
      const loaded = await PDFDocument.load(part.bytes);
      expect(loaded.getPageCount()).toBe(part.pageIndices.length);
    }
  });

  it("generates the smallest reasonable number of parts (greedy packing) rather than one page per part", async () => {
    const bytes = await makeTextPdf(6, 5);
    const result = await splitPdfBySize(bytes, 50 * 1024); // limite generoso
    expect(result.parts.length).toBeLessThan(6);
  });
});
