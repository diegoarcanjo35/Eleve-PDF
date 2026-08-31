import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import type { StructuralFindings } from "./structuralFindings";

export type { StructuralFindings } from "./structuralFindings";
export { UNKNOWN_STRUCTURAL_FINDINGS, hasSplitRiskyStructures } from "./structuralFindings";

function resolve(doc: PDFDocument, value: unknown): unknown {
  if (value instanceof PDFRef) return doc.context.lookup(value);
  return value;
}

function hasSignatureField(doc: PDFDocument, fieldsArray: PDFArray, depth = 0): boolean {
  if (depth > 20) return false; // guarda contra ciclos/estruturas anômalas
  for (let i = 0; i < fieldsArray.size(); i += 1) {
    const field = resolve(doc, fieldsArray.get(i));
    if (!(field instanceof PDFDict)) continue;
    const fieldType = resolve(doc, field.get(PDFName.of("FT")));
    if (fieldType instanceof PDFName && fieldType.asString() === "/Sig") return true;
    const kids = resolve(doc, field.get(PDFName.of("Kids")));
    if (kids instanceof PDFArray && hasSignatureField(doc, kids, depth + 1)) return true;
  }
  return false;
}

function countPagesWithAnnotationSubtype(doc: PDFDocument, subtype: string): number {
  let count = 0;
  for (const page of doc.getPages()) {
    const annots = resolve(doc, page.node.get(PDFName.of("Annots")));
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i += 1) {
      const annot = resolve(doc, annots.get(i));
      if (!(annot instanceof PDFDict)) continue;
      const annotSubtype = resolve(doc, annot.get(PDFName.of("Subtype")));
      if (annotSubtype instanceof PDFName && annotSubtype.asString() === `/${subtype}`) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/**
 * Inspeciona estruturas de NÍVEL DE DOCUMENTO (catálogo) que a divisão pode não
 * preservar, porque cada parte é um documento novo criado a partir de páginas
 * copiadas (`PDFDocument.copyPages`) — não uma cópia do catálogo original.
 *
 * Comprovado empiricamente (não é uma suposição): dividir um PDF com AcroForm,
 * Outlines e Names/Dests faz essas três estruturas desaparecerem do catálogo de
 * cada parte, mesmo que os objetos de página em si (e anotações Link/Widget
 * neles) sejam copiados com sucesso. Ver RELATORIO-AUDITORIA.md para o
 * experimento reproduzível. Só é usado dentro do Web Worker (pdf-lib não deve
 * entrar no bundle do thread principal).
 */
export function analyzePdfStructure(doc: PDFDocument): StructuralFindings {
  const catalog = doc.catalog;

  const acroForm = resolve(doc, catalog.get(PDFName.of("AcroForm")));
  const hasAcroForm = acroForm instanceof PDFDict;

  let hasDigitalSignatureFields = false;
  if (acroForm instanceof PDFDict) {
    const fields = resolve(doc, acroForm.get(PDFName.of("Fields")));
    if (fields instanceof PDFArray) {
      hasDigitalSignatureFields = hasSignatureField(doc, fields);
    }
  }
  // /Perms no catálogo também indica assinatura (ex.: assinaturas de certificação).
  if (!hasDigitalSignatureFields && catalog.get(PDFName.of("Perms"))) {
    hasDigitalSignatureFields = true;
  }

  const outlines = resolve(doc, catalog.get(PDFName.of("Outlines")));
  const hasOutlines = outlines instanceof PDFDict;

  let hasNamedDestinations = !!catalog.get(PDFName.of("Dests"));
  const names = resolve(doc, catalog.get(PDFName.of("Names")));
  if (!hasNamedDestinations && names instanceof PDFDict) {
    hasNamedDestinations = !!names.get(PDFName.of("Dests"));
  }

  const hasDocumentMetadataStream = !!catalog.get(PDFName.of("Metadata"));

  return {
    analyzedSuccessfully: true,
    hasAcroForm,
    hasDigitalSignatureFields,
    hasOutlines,
    hasNamedDestinations,
    hasDocumentMetadataStream,
    pagesWithLinkAnnotations: countPagesWithAnnotationSubtype(doc, "Link"),
    pagesWithWidgetAnnotations: countPagesWithAnnotationSubtype(doc, "Widget"),
  };
}
