import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { compressPdf } from "../pdfCompress";
import { makePdfWithJpegImage, makeTextPdf } from "@/test/pdfFixtures";

describe("compressPdf — nível leve (sem perda)", () => {
  it("produces a smaller-or-equal, valid PDF preserving page count", async () => {
    const original = await makeTextPdf(5, 40);
    const result = await compressPdf(original, "leve");

    expect(result.usedImageRecompression).toBe(false);
    expect(result.usedRasterization).toBe(false);
    expect(result.bytes.byteLength).toBeLessThanOrEqual(original.byteLength);

    const loaded = await PDFDocument.load(result.bytes);
    expect(loaded.getPageCount()).toBe(5);
  });

  it("never touches images even when present", async () => {
    const original = await makePdfWithJpegImage(2);
    const result = await compressPdf(original, "leve");
    expect(result.imagesRecompressed).toBe(0);

    const loaded = await PDFDocument.load(result.bytes);
    expect(loaded.getPageCount()).toBe(2);
  });
});

describe("compressPdf — níveis equilibrada e máxima", () => {
  it("finds embedded JPEG images and reports the outcome honestly", async () => {
    const original = await makePdfWithJpegImage(3);
    const result = await compressPdf(original, "equilibrada");

    expect(result.usedImageRecompression).toBe(true);
    expect(result.imagesFound).toBeGreaterThan(0);
    // Em ambiente sem OffscreenCanvas/createImageBitmap (Node/jsdom), a recompressão
    // real de imagem não está disponível — o código deve declarar isso via skip,
    // nunca fingir sucesso.
    if (result.imagesRecompressed === 0) {
      expect(result.skips.some((skip) => skip.reason === "encode-unsupported")).toBe(true);
    }

    const loaded = await PDFDocument.load(result.bytes);
    expect(loaded.getPageCount()).toBe(3);
  });

  it("never rasterizes pages — output stays a valid multi-page vector/text PDF", async () => {
    const original = await makeTextPdf(4, 30);
    const result = await compressPdf(original, "maxima");
    expect(result.usedRasterization).toBe(false);

    const loaded = await PDFDocument.load(result.bytes);
    expect(loaded.getPageCount()).toBe(4);
  });

  it("reports zero images found honestly for a text-only PDF", async () => {
    const original = await makeTextPdf(2, 20);
    const result = await compressPdf(original, "maxima");
    expect(result.imagesFound).toBe(0);
    expect(result.imagesRecompressed).toBe(0);
  });
});
