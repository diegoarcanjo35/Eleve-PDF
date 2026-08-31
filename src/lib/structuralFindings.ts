/**
 * Tipos e lógica pura sobre achados estruturais — módulo leve, SEM dependência de
 * `pdf-lib`, para que componentes de UI (thread principal) não puxem a biblioteca
 * pesada de manipulação de PDF só para checar um booleano. A análise de verdade
 * (que precisa de pdf-lib) vive em `structuralAnalysis.ts`, usado só dentro do worker.
 */
export interface StructuralFindings {
  /** false só quando a análise estrutural falhou e nada abaixo pôde ser verificado. */
  analyzedSuccessfully: boolean;
  hasAcroForm: boolean;
  hasDigitalSignatureFields: boolean;
  hasOutlines: boolean;
  hasNamedDestinations: boolean;
  hasDocumentMetadataStream: boolean;
  pagesWithLinkAnnotations: number;
  pagesWithWidgetAnnotations: number;
}

/** Usado quando a análise estrutural não pôde ser concluída — nunca afirma ausência de risco. */
export const UNKNOWN_STRUCTURAL_FINDINGS: StructuralFindings = {
  analyzedSuccessfully: false,
  hasAcroForm: false,
  hasDigitalSignatureFields: false,
  hasOutlines: false,
  hasNamedDestinations: false,
  hasDocumentMetadataStream: false,
  pagesWithLinkAnnotations: 0,
  pagesWithWidgetAnnotations: 0,
};

/** true se houver qualquer estrutura de nível de documento que a divisão não preserva. */
export function hasSplitRiskyStructures(findings: StructuralFindings): boolean {
  return (
    !findings.analyzedSuccessfully ||
    findings.hasAcroForm ||
    findings.hasOutlines ||
    findings.hasNamedDestinations ||
    findings.pagesWithWidgetAnnotations > 0
  );
}
