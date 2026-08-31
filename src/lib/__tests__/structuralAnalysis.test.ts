import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { analyzePdfStructure, hasSplitRiskyStructures } from "../structuralAnalysis";
import { splitPdfBySize } from "../pdfSplit";
import {
  makePdfWithSensitiveStructures,
  makePdfWithSignatureField,
  makeTextPdf,
} from "@/test/pdfFixtures";

describe("analyzePdfStructure — detecção real, não simulada", () => {
  it("detecta AcroForm, outline, destino nomeado e link em um PDF real que os contém", async () => {
    const bytes = await makePdfWithSensitiveStructures();
    const doc = await PDFDocument.load(bytes);
    const findings = analyzePdfStructure(doc);

    expect(findings.analyzedSuccessfully).toBe(true);
    expect(findings.hasAcroForm).toBe(true);
    expect(findings.hasOutlines).toBe(true);
    expect(findings.hasNamedDestinations).toBe(true);
    expect(findings.pagesWithLinkAnnotations).toBe(1);
    expect(findings.pagesWithWidgetAnnotations).toBe(1);
    expect(hasSplitRiskyStructures(findings)).toBe(true);
  });

  it("não detecta falsamente estruturas sensíveis em um PDF de texto simples", async () => {
    const bytes = await makeTextPdf(3, 10);
    const doc = await PDFDocument.load(bytes);
    const findings = analyzePdfStructure(doc);

    expect(findings.hasAcroForm).toBe(false);
    expect(findings.hasOutlines).toBe(false);
    expect(findings.hasNamedDestinations).toBe(false);
    expect(findings.pagesWithLinkAnnotations).toBe(0);
    expect(findings.pagesWithWidgetAnnotations).toBe(0);
    expect(findings.hasDigitalSignatureFields).toBe(false);
    expect(hasSplitRiskyStructures(findings)).toBe(false);
  });

  it("detecta um campo de assinatura digital (FT /Sig) real dentro do AcroForm", async () => {
    const bytes = await makePdfWithSignatureField();
    const doc = await PDFDocument.load(bytes);
    const findings = analyzePdfStructure(doc);

    expect(findings.hasDigitalSignatureFields).toBe(true);
  });
});

describe("Divisão + estruturas sensíveis — comprovação do que é e não é preservado", () => {
  it("AcroForm, outline e destinos nomeados NÃO sobrevivem à divisão (cada parte é um documento novo)", async () => {
    const bytes = await makePdfWithSensitiveStructures();
    const result = await splitPdfBySize(bytes, 1024 * 1024); // limite folgado: 1 parte só, com as 2 páginas
    expect(result.parts).toHaveLength(1);

    const part = await PDFDocument.load(result.parts[0]!.bytes);
    const findings = analyzePdfStructure(part);

    // Confirma, com um teste reprodutível, exatamente o que o relatório afirma:
    // essas estruturas de CATÁLOGO não são recriadas na parte gerada.
    expect(findings.hasAcroForm).toBe(false);
    expect(findings.hasOutlines).toBe(false);
    expect(findings.hasNamedDestinations).toBe(false);
  });

  it("o link (anotação) na página copiada continua presente e com a mesma URI", async () => {
    const bytes = await makePdfWithSensitiveStructures();
    const result = await splitPdfBySize(bytes, 1024 * 1024);
    const part = await PDFDocument.load(result.parts[0]!.bytes);
    const findings = analyzePdfStructure(part);

    expect(findings.pagesWithLinkAnnotations).toBe(1);
  });

  it("dividir uma única página com o campo de formulário ainda deixa a anotação visualmente presente, mas o AcroForm não é reconstituído", async () => {
    const bytes = await makePdfWithSensitiveStructures();
    // limite minúsculo o suficiente para separar a página 1 (com o campo) sozinha
    const result = await splitPdfBySize(bytes, 4000);
    const firstPart = await PDFDocument.load(result.parts[0]!.bytes);
    const findings = analyzePdfStructure(firstPart);

    expect(findings.pagesWithWidgetAnnotations).toBe(1); // a anotação Widget está lá
    expect(findings.hasAcroForm).toBe(false); // mas não está registrada como formulário do documento
  });
});
