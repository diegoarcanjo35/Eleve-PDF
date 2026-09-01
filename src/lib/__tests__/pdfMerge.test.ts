import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { mergePdfs, type MergeProgress } from "../pdfMerge";
import { PdfAppError } from "../errors";
import { makeTextPdf } from "@/test/pdfFixtures";

/** PDF com N páginas de um tamanho exclusivo — usado só para provar, de forma
 *  inequívoca, que a ordem das páginas na saída segue a ordem de entrada dos
 *  arquivos (o tamanho da página funciona como "assinatura" de qual arquivo
 *  de origem cada página copiada veio). */
async function makeSizedPdf(pageCount: number, size: [number, number]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage(size);
  }
  return doc.save();
}

describe("mergePdfs", () => {
  it("junta dois PDFs válidos em um único documento, somando as páginas de ambos", async () => {
    const a = await makeTextPdf(2);
    const b = await makeTextPdf(3);
    const result = await mergePdfs([a, b]);

    expect(result.fileCount).toBe(2);
    expect(result.totalPages).toBe(5);
  });

  it("junta três ou mais PDFs, somando as páginas de todos eles", async () => {
    const a = await makeTextPdf(2);
    const b = await makeTextPdf(1);
    const c = await makeTextPdf(4);
    const result = await mergePdfs([a, b, c]);

    expect(result.fileCount).toBe(3);
    expect(result.totalPages).toBe(7);
  });

  it("preserva a ordem das páginas conforme a ordem de entrada dos arquivos", async () => {
    const a = await makeSizedPdf(2, [200, 200]);
    const b = await makeSizedPdf(3, [300, 300]);
    const c = await makeSizedPdf(1, [400, 400]);

    const result = await mergePdfs([a, b, c]);
    expect(result.totalPages).toBe(6);

    const reloaded = await PDFDocument.load(result.bytes);
    const sizes = reloaded.getPages().map((page) => {
      const { width, height } = page.getSize();
      return [width, height];
    });

    expect(sizes).toEqual([
      [200, 200],
      [200, 200],
      [300, 300],
      [300, 300],
      [300, 300],
      [400, 400],
    ]);
  });

  it("o resultado é um PDF válido e recarregável, com a contagem total de páginas esperada", async () => {
    const a = await makeTextPdf(3);
    const b = await makeTextPdf(2);
    const result = await mergePdfs([a, b]);

    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(5);
  });

  it("preserva o conteúdo (fonte incorporada) das páginas copiadas — proxy estrutural para texto pesquisável", async () => {
    // Não há extração de texto real disponível no ambiente de teste (Node/Vitest,
    // sem worker/pdfjs). Como proxy honesto, verifica que a página copiada mantém
    // um recurso de fonte no dicionário /Resources — prova que o content stream
    // (e a fonte que o torna pesquisável) foi copiado, não apenas rasterizado.
    const a = await makeTextPdf(1);
    const result = await mergePdfs([a, await makeTextPdf(1)]);
    const reloaded = await PDFDocument.load(result.bytes);
    const page = reloaded.getPages()[0]!;
    const resources = page.node.Resources();
    const fonts = resources?.get(PDFName.of("Font"));
    expect(fonts).toBeDefined();
  });

  it("rejeita quando recebe menos de dois arquivos", async () => {
    const a = await makeTextPdf(1);
    await expect(mergePdfs([a])).rejects.toMatchObject({
      code: "processing-failed",
    } satisfies Partial<PdfAppError>);
  });

  it("reporta progresso: reading -> merging (por arquivo) -> finalizing", async () => {
    const a = await makeTextPdf(1);
    const b = await makeTextPdf(1);
    const stages: MergeProgress[] = [];
    await mergePdfs([a, b], (progress) => stages.push(progress));

    expect(stages[0]).toMatchObject({ stage: "reading", filesProcessed: 0, totalFiles: 2 });
    expect(stages.filter((s) => s.stage === "merging")).toHaveLength(2);
    expect(stages.at(-1)).toMatchObject({ stage: "finalizing", filesProcessed: 2, totalFiles: 2 });
  });

  it("interrompe a junção quando cancelada antes de terminar", async () => {
    const a = await makeTextPdf(1);
    const b = await makeTextPdf(1);
    let calls = 0;
    const isCancelled = () => {
      calls += 1;
      return calls > 1;
    };

    await expect(mergePdfs([a, b], undefined, isCancelled)).rejects.toMatchObject({
      code: "processing-failed",
    } satisfies Partial<PdfAppError>);
  });
});
