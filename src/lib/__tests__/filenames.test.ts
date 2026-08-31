import { describe, expect, it } from "vitest";
import { compressedFileName, partFileName, sanitizeBaseName } from "../filenames";

describe("sanitizeBaseName", () => {
  it("strips the .pdf extension", () => {
    expect(sanitizeBaseName("relatorio.pdf")).toBe("relatorio");
  });

  it("removes path segments", () => {
    expect(sanitizeBaseName("C:\\Users\\me\\relatorio.pdf")).toBe("relatorio");
  });

  it("replaces spaces and strips accents/special chars", () => {
    expect(sanitizeBaseName("Relatório Final (v2).pdf")).toBe("Relatorio-Final-v2");
  });

  it("falls back to a default name when empty", () => {
    expect(sanitizeBaseName("****.pdf")).toBe("documento");
  });
});

describe("partFileName", () => {
  it("pads sequential numbers to at least 2 digits", () => {
    expect(partFileName("contrato.pdf", 1, 3)).toBe("contrato-parte-01.pdf");
    expect(partFileName("contrato.pdf", 2, 3)).toBe("contrato-parte-02.pdf");
  });

  it("pads to match the total width when over 99 parts", () => {
    expect(partFileName("contrato.pdf", 5, 120)).toBe("contrato-parte-005.pdf");
  });
});

describe("compressedFileName", () => {
  it("appends -compactado suffix", () => {
    expect(compressedFileName("contrato.pdf")).toBe("contrato-compactado.pdf");
  });
});
