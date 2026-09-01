import { describe, expect, it } from "vitest";
import { hasMergeRiskyStructures, hasSplitRiskyStructures, type StructuralFindings } from "../structuralFindings";

const BASE_FINDINGS: StructuralFindings = {
  analyzedSuccessfully: true,
  hasAcroForm: false,
  hasDigitalSignatureFields: false,
  hasOutlines: false,
  hasNamedDestinations: false,
  hasDocumentMetadataStream: false,
  pagesWithLinkAnnotations: 0,
  pagesWithWidgetAnnotations: 0,
};

describe("hasSplitRiskyStructures", () => {
  it("é risco quando só há um stream de metadados do catálogo (metadata-only)", () => {
    const findings: StructuralFindings = { ...BASE_FINDINGS, hasDocumentMetadataStream: true };
    expect(hasSplitRiskyStructures(findings)).toBe(true);
  });

  it("é risco quando só há links em página (link-only)", () => {
    const findings: StructuralFindings = { ...BASE_FINDINGS, pagesWithLinkAnnotations: 1 };
    expect(hasSplitRiskyStructures(findings)).toBe(true);
  });

  it("não é risco para um documento simples, sem nenhuma estrutura sensível", () => {
    expect(hasSplitRiskyStructures(BASE_FINDINGS)).toBe(false);
  });
});

describe("hasMergeRiskyStructures (Fase 3.1 — Juntar PDFs)", () => {
  it("usa exatamente o mesmo critério de hasSplitRiskyStructures, para qualquer achado", () => {
    const cases: StructuralFindings[] = [
      BASE_FINDINGS,
      { ...BASE_FINDINGS, hasAcroForm: true },
      { ...BASE_FINDINGS, hasOutlines: true },
      { ...BASE_FINDINGS, hasNamedDestinations: true },
      { ...BASE_FINDINGS, hasDocumentMetadataStream: true },
      { ...BASE_FINDINGS, pagesWithWidgetAnnotations: 2 },
      { ...BASE_FINDINGS, pagesWithLinkAnnotations: 1 },
      { ...BASE_FINDINGS, analyzedSuccessfully: false },
    ];
    for (const findings of cases) {
      expect(hasMergeRiskyStructures(findings)).toBe(hasSplitRiskyStructures(findings));
    }
  });

  it("assinatura digital sozinha não é sinalizada por este critério (aviso próprio na MergePage)", () => {
    const findings: StructuralFindings = { ...BASE_FINDINGS, hasDigitalSignatureFields: true };
    expect(hasMergeRiskyStructures(findings)).toBe(false);
  });
});
