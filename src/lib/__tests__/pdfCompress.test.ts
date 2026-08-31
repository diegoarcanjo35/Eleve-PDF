import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { compressPdf } from "../pdfCompress";
import {
  makeImagePdfWithDictOverrides,
  makePdfWithFlateImage,
  makePdfWithJpegImage,
  makeTextPdf,
} from "@/test/pdfFixtures";

describe("compressPdf — regra geral: nunca entregar um resultado maior como se fosse redução", () => {
  it("quando o resultado não fica menor, devolve o original intacto byte a byte", async () => {
    const original = await makeTextPdf(5, 40);
    const result = await compressPdf(original, "leve");

    if (result.outcome === "no-gain-original-preserved") {
      expect(result.finalBytes).toBe(original.byteLength);
      expect(Buffer.from(result.bytes)).toEqual(Buffer.from(original));
    } else {
      expect(result.finalBytes).toBeLessThan(original.byteLength);
    }
    expect(result.bytes.byteLength).toBe(result.finalBytes);
  });

  it("quando há redução real, o resultado é estritamente menor que o original", async () => {
    const original = await makePdfWithJpegImage(3);
    const result = await compressPdf(original, "equilibrada");
    if (result.outcome === "reduced") {
      expect(result.finalBytes).toBeLessThan(original.byteLength);
    } else {
      expect(result.finalBytes).toBe(original.byteLength);
      expect(Buffer.from(result.bytes)).toEqual(Buffer.from(original));
    }
  });

  it("nunca reporta imagens recomprimidas quando o resultado final não foi mantido (no-gain)", async () => {
    const original = await makeTextPdf(3, 20);
    const result = await compressPdf(original, "leve");
    if (result.outcome === "no-gain-original-preserved") {
      expect(result.imagesRecompressed).toBe(0);
    }
  });
});

describe("compressPdf — nível leve (sem perda)", () => {
  it("nunca produz um resultado maior que o original e preserva o número de páginas", async () => {
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

describe("compressPdf — portão de elegibilidade de imagem (Equilibrada/Máxima)", () => {
  it("JPEG RGB simples, 8 bits, sem máscara: é candidato elegível (só não recomprime de fato em Node por falta de OffscreenCanvas)", async () => {
    const original = await makeImagePdfWithDictOverrides({});
    const result = await compressPdf(original, "equilibrada");
    expect(result.imagesFound).toBe(1);
    // Elegível pelo dicionário, mas o ambiente de teste (Node/jsdom) não tem
    // OffscreenCanvas/createImageBitmap — o código deve declarar isso, nunca fingir.
    expect(result.skips.some((s) => s.reason === "encode-unsupported")).toBe(true);
  });

  it("recusa ColorSpace diferente de DeviceRGB (ex.: DeviceGray) com o motivo correto", async () => {
    const original = await makeImagePdfWithDictOverrides({ ColorSpace: "DeviceGray" });
    const result = await compressPdf(original, "equilibrada");
    expect(result.imagesRecompressed).toBe(0);
    expect(result.skips.some((s) => s.reason === "unsupported-color-space")).toBe(true);

    const loaded = await PDFDocument.load(result.bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("recusa ColorSpace DeviceCMYK com o motivo correto", async () => {
    const original = await makeImagePdfWithDictOverrides({ ColorSpace: "DeviceCMYK" });
    const result = await compressPdf(original, "equilibrada");
    expect(result.imagesRecompressed).toBe(0);
    expect(result.skips.some((s) => s.reason === "unsupported-color-space")).toBe(true);
  });

  it("recusa BitsPerComponent diferente de 8 com o motivo correto", async () => {
    const original = await makeImagePdfWithDictOverrides({ BitsPerComponent: 1 });
    const result = await compressPdf(original, "equilibrada");
    expect(result.imagesRecompressed).toBe(0);
    expect(result.skips.some((s) => s.reason === "unsupported-bits-per-component")).toBe(true);
  });

  it("recusa imagens com SMask (transparência) com o motivo correto", async () => {
    const original = await makeImagePdfWithDictOverrides({ withSMask: true });
    const result = await compressPdf(original, "equilibrada");
    expect(result.imagesRecompressed).toBe(0);
    expect(result.skips.some((s) => s.reason === "soft-mask-present")).toBe(true);

    const loaded = await PDFDocument.load(result.bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("recusa imagens com Mask com o motivo correto", async () => {
    const original = await makeImagePdfWithDictOverrides({ withMask: true });
    const result = await compressPdf(original, "equilibrada");
    expect(result.imagesRecompressed).toBe(0);
    expect(result.skips.some((s) => s.reason === "mask-present")).toBe(true);
  });

  it("recusa DecodeParms customizado com o motivo correto", async () => {
    const original = await makeImagePdfWithDictOverrides({ withDecodeParms: true });
    const result = await compressPdf(original, "equilibrada");
    expect(result.imagesRecompressed).toBe(0);
    expect(result.skips.some((s) => s.reason === "unsupported-decode-params")).toBe(true);
  });

  it("nunca recomprime imagens que não são DCTDecode (ex.: PNG/FlateDecode), e o PDF final continua válido", async () => {
    const original = await makePdfWithFlateImage(2);
    const result = await compressPdf(original, "maxima");
    expect(result.imagesFound).toBe(1);
    expect(result.imagesRecompressed).toBe(0);
    expect(result.skips.some((s) => s.reason === "unsupported-filter")).toBe(true);

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
