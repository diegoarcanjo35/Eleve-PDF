import { describe, expect, it } from "vitest";
import { parsePageSpans } from "../intelligenceRetrieval";

describe("parsePageSpans (Sprint 01L.1) — nunca lança, degrada com segurança", () => {
  it("14. page_spans_json NULL (chunk legado) → undefined", () => {
    expect(parsePageSpans(null)).toBeUndefined();
  });

  it("15. page_spans_json inválido (JSON malformado) → undefined, sem lançar", () => {
    expect(() => parsePageSpans("{isso nao é json")).not.toThrow();
    expect(parsePageSpans("{isso nao é json")).toBeUndefined();
  });

  it("JSON válido mas não é array → undefined", () => {
    expect(parsePageSpans(JSON.stringify({ page: 1 }))).toBeUndefined();
  });

  it("array com item de formato errado (faltando campo) → undefined", () => {
    expect(parsePageSpans(JSON.stringify([{ page: 1, startOffset: 0 }]))).toBeUndefined();
  });

  it("array com item de tipo errado (string em vez de number) → undefined", () => {
    expect(parsePageSpans(JSON.stringify([{ page: "1", startOffset: 0, endOffset: 5 }]))).toBeUndefined();
  });

  it("JSON válido e bem formado → PageSpan[] reidratado corretamente", () => {
    const raw = JSON.stringify([
      { page: 1, startOffset: 0, endOffset: 10 },
      { page: 2, startOffset: 11, endOffset: 20 },
    ]);
    expect(parsePageSpans(raw)).toEqual([
      { page: 1, startOffset: 0, endOffset: 10 },
      { page: 2, startOffset: 11, endOffset: 20 },
    ]);
  });

  it("array vazio → array vazio (não undefined — sintaticamente válido, só sem spans)", () => {
    expect(parsePageSpans("[]")).toEqual([]);
  });
});
