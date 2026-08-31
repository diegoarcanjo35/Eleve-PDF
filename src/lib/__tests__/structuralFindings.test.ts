import { describe, expect, it } from "vitest";
import { hasSplitRiskyStructures, type StructuralFindings } from "../structuralFindings";

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
