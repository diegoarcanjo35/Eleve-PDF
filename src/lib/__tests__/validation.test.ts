import { describe, expect, it } from "vitest";
import { hasPdfSignature, validatePdfBytes } from "../validation";
import { PdfAppError } from "../errors";
import { corrupt, makeTextPdf } from "@/test/pdfFixtures";

describe("hasPdfSignature", () => {
  it("accepts real PDF magic bytes", async () => {
    const bytes = await makeTextPdf(1);
    expect(hasPdfSignature(bytes)).toBe(true);
  });

  it("rejects plain text", () => {
    const bytes = new TextEncoder().encode("não sou um pdf");
    expect(hasPdfSignature(bytes)).toBe(false);
  });

  it("rejects empty input", () => {
    expect(hasPdfSignature(new Uint8Array())).toBe(false);
  });
});

describe("validatePdfBytes", () => {
  it("validates a real, well-formed PDF and returns its page count", async () => {
    const bytes = await makeTextPdf(3);
    const result = await validatePdfBytes(bytes, bytes.byteLength);
    expect(result.pageCount).toBe(3);
  });

  it("rejects a file without PDF signature as not-a-pdf", async () => {
    const bytes = new TextEncoder().encode("hello world");
    await expect(validatePdfBytes(bytes, bytes.byteLength)).rejects.toMatchObject({
      code: "not-a-pdf",
    } satisfies Partial<PdfAppError>);
  });

  it("rejects a truncated/corrupted PDF as corrupted", async () => {
    const valid = await makeTextPdf(2);
    const corrupted = corrupt(valid, 0.5);
    await expect(validatePdfBytes(corrupted, corrupted.byteLength)).rejects.toMatchObject({
      code: "corrupted",
    });
  });

  it("rejects files above the size limit", async () => {
    const bytes = await makeTextPdf(1);
    await expect(
      validatePdfBytes(bytes, 500 * 1024 * 1024),
    ).rejects.toMatchObject({ code: "too-large" });
  });
});
