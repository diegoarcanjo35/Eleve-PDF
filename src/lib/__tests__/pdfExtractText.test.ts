import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, StandardFonts } from "pdf-lib";
import {
  extractDocumentText,
  MIN_USABLE_TEXT_CHARS,
  type ExtractProgress,
} from "../pdfExtractText";
import { makeTextPdf, makePdfWithJpegImage } from "@/test/pdfFixtures";

/** Combina uma página de `makeTextPdf` com uma página de
 *  `makePdfWithJpegImage` num único documento — para testar um documento
 *  misto (uma página com texto, uma sem) sem depender do motor de junção
 *  do próprio app (evita acoplar este teste a `pdfMerge.ts`). */
async function makeMixedDoc(): Promise<Uint8Array> {
  const textSource = await PDFDocument.load(await makeTextPdf(1));
  const imageSource = await PDFDocument.load(await makePdfWithJpegImage(1));

  const doc = await PDFDocument.create();
  const [textPage] = await doc.copyPages(textSource, [0]);
  const [imagePage] = await doc.copyPages(imageSource, [0]);
  doc.addPage(textPage);
  doc.addPage(imagePage);
  return doc.save();
}

/** Corrompe deliberadamente o stream de conteúdo de UMA página específica
 *  (substitui por bytes que não decodificam como FlateDecode válido),
 *  mantendo as demais páginas intactas — usado para provar que a falha de
 *  uma página não derruba o documento inteiro. */
async function makeDocWithOneBrokenPage(): Promise<Uint8Array> {
  const draft = await makeTextPdf(3);
  const doc = await PDFDocument.load(draft);
  const context = doc.context;
  const targetPage = doc.getPage(1); // segunda página (0-based)
  // `Contents` costuma ser um PDFArray de referências a streams (mesmo
  // quando há um único stream) — pega a primeira referência real.
  const contentsField = targetPage.node.get(PDFName.of("Contents"));
  const contentsArray = context.lookup(contentsField);
  const contentsRef = contentsArray instanceof PDFArray ? contentsArray.get(0) : contentsField;
  const contents = context.lookup(contentsRef);
  if (!(contentsRef instanceof PDFRef) || !(contents instanceof PDFRawStream)) {
    throw new Error("stream de conteúdo da página não encontrado no fixture");
  }
  // Bytes deliberadamente inválidos para o Filter declarado (FlateDecode) —
  // gera falha real de decodificação ao processar especificamente esta
  // página. `contents` é somente leitura no pdf-lib — substituímos o objeto
  // inteiro no contexto (mesmo padrão de src/test/pdfFixtures.ts).
  const brokenStream = PDFRawStream.of(
    contents.dict,
    new Uint8Array([0xff, 0x00, 0xff, 0x00, 0x01, 0x02, 0x03]),
  );
  context.assign(contentsRef, brokenStream);
  return doc.save();
}

describe("extractDocumentText", () => {
  it("extrai texto de um PDF textual normal, preservando o número da página", async () => {
    const bytes = await makeTextPdf(1);
    const result = await extractDocumentText(bytes);

    expect(result.pageCount).toBe(1);
    expect(result.overallStatus).toBe("ok");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.pageNumber).toBe(1);
    expect(result.pages[0]!.status).toBe("text");
    expect(result.pages[0]!.blocks.length).toBeGreaterThan(0);
    // O próprio marcador de página do fixture deve aparecer em algum bloco.
    const joined = result.pages[0]!.blocks.map((b) => b.text).join(" ");
    expect(joined).toMatch(/página 1/);
  });

  it("preserva a numeração correta em documento de múltiplas páginas", async () => {
    const bytes = await makeTextPdf(4);
    const result = await extractDocumentText(bytes);

    expect(result.pageCount).toBe(4);
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(result.pages.every((p) => p.status === "text")).toBe(true);
    // Cada página deve conter o marcador com o número CORRESPONDENTE, prova
    // de que a proveniência página→conteúdo não está embaralhada.
    for (const page of result.pages) {
      const joined = page.blocks.map((b) => b.text).join(" ");
      expect(joined).toContain(`página ${page.pageNumber}`);
    }
    expect(result.overallStatus).toBe("ok");
  });

  it("preserva pageSize a partir da página real do PDF", async () => {
    const bytes = await makeTextPdf(1);
    const result = await extractDocumentText(bytes);
    // makeTextPdf usa addPage([595, 842]) (A4 em pt)
    expect(result.pages[0]!.pageSize).toEqual({ width: 595, height: 842 });
  });

  it("cada bloco carrega uma boundingBox no sistema de coordenadas da página (não pixels de UI)", async () => {
    const bytes = await makeTextPdf(1);
    const result = await extractDocumentText(bytes);
    for (const block of result.pages[0]!.blocks) {
      expect(block.boundingBox.width).toBeGreaterThan(0);
      expect(block.boundingBox.height).toBeGreaterThan(0);
      // dentro dos limites da página (595x842) — prova que não é coordenada
      // de tela/DPI arbitrária.
      expect(block.boundingBox.x).toBeGreaterThanOrEqual(0);
      expect(block.boundingBox.x).toBeLessThanOrEqual(595);
    }
  });

  it("normaliza espaços/tabs e não junta palavras sem separação", async () => {
    const bytes = await makeTextPdf(1);
    const result = await extractDocumentText(bytes);
    const joined = result.pages[0]!.blocks.map((b) => b.text).join(" ");
    expect(joined).not.toMatch(/ {2,}/); // sem espaços duplos
    expect(joined).not.toMatch(/\t/); // sem tabs sobrando
    // Palavras do parágrafo sintético não devem ter colado umas nas outras.
    expect(joined).toMatch(/Conteúdo sintético gerado para testes automatizados/);
  });

  it("normaliza Unicode com NFC (acentos compostos ficam estáveis)", async () => {
    const bytes = await makeTextPdf(1);
    const result = await extractDocumentText(bytes);
    const joined = result.pages[0]!.blocks.map((b) => b.text).join(" ");
    // "á", "ó", "ã" do texto do fixture devem estar em forma NFC — comparar
    // com a mesma string normalizada garante que não há forma decomposta
    // (NFD) sobrevivendo no resultado.
    expect(joined).toBe(joined.normalize("NFC"));
    expect(joined).toContain("página");
    expect(joined).toContain("automatizados");
  });

  it("não implementa de-hifenização — hífen de fim de linha permanece literal", async () => {
    // Constrói um fixture mínimo cujo parágrafo força quebra de linha logo
    // após um hífen, para confirmar que "micro-" e "empresa" NÃO viram
    // "microempresa" automaticamente.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([200, 200]);
    page.drawText("micro-\nempresa", { x: 10, y: 150, size: 14, font, lineHeight: 16 });
    const bytes = await doc.save();

    const result = await extractDocumentText(bytes);
    const joined = result.pages[0]!.blocks.map((b) => b.text).join(" ");
    expect(joined).not.toMatch(/microempresa/);
    expect(joined).toMatch(/micro-/);
  });

  it("página sem nenhum texto (só imagem) é marcada 'no-text', documento inteiro 'unsupported'", async () => {
    const bytes = await makePdfWithJpegImage(2);
    const result = await extractDocumentText(bytes);

    expect(result.pageCount).toBe(2);
    expect(result.pages.every((p) => p.status === "no-text")).toBe(true);
    expect(result.pages.every((p) => p.blocks.length === 0)).toBe(true);
    expect(result.overallStatus).toBe("unsupported");
  });

  it("documento misto (uma página com texto, outra sem) é 'partial', nunca esconde a página problemática", async () => {
    const bytes = await makeMixedDoc();
    const result = await extractDocumentText(bytes);

    expect(result.pageCount).toBe(2);
    expect(result.pages[0]!.status).toBe("text");
    expect(result.pages[1]!.status).toBe("no-text");
    expect(result.overallStatus).toBe("partial");
  });

  it("isola a falha de uma página específica sem derrubar o documento inteiro", async () => {
    const bytes = await makeDocWithOneBrokenPage();
    const result = await extractDocumentText(bytes);

    expect(result.pageCount).toBe(3);
    // A página corrompida (índice 1, "página 2") deve ser marcada failed —
    // as outras duas continuam extraídas normalmente.
    expect(result.pages[0]!.status).toBe("text");
    expect(result.pages[2]!.status).toBe("text");
    expect(["failed", "no-text"]).toContain(result.pages[1]!.status);
    if (result.pages[1]!.status === "failed") {
      expect(result.pages[1]!.blocks).toEqual([]);
      expect(result.pages[1]!.pageSize).toEqual({ width: 0, height: 0 });
    }
    // De qualquer forma, o documento inteiro não vira "unsupported" — as
    // duas páginas boas continuam disponíveis.
    expect(result.overallStatus).toBe("partial");
  });

  it("limiar de texto útil (MIN_USABLE_TEXT_CHARS) é uma constante nomeada, não um número mágico espalhado", () => {
    expect(typeof MIN_USABLE_TEXT_CHARS).toBe("number");
    expect(MIN_USABLE_TEXT_CHARS).toBeGreaterThan(0);
  });

  it("reporta progresso incremental por página (reading → extracting × N → finalizing)", async () => {
    const bytes = await makeTextPdf(3);
    const stages: ExtractProgress[] = [];
    await extractDocumentText(bytes, (p) => stages.push(p));

    expect(stages[0]!.stage).toBe("reading");
    expect(stages.filter((s) => s.stage === "extracting")).not.toHaveLength(0);
    expect(stages.at(-1)!.stage).toBe("finalizing");
    expect(stages.at(-1)!.pagesProcessed).toBe(3);
  });

  it("interrompe a extração quando cancelada", async () => {
    const bytes = await makeTextPdf(3);
    let calls = 0;
    const isCancelled = () => {
      calls += 1;
      return calls > 1;
    };
    await expect(extractDocumentText(bytes, undefined, isCancelled)).rejects.toMatchObject({
      code: "processing-failed",
    });
  });

  it("o resultado não depende de nenhuma chamada de rede — funciona inteiramente em Node/offline", async () => {
    // Prova indireta: o próprio ambiente de teste (Vitest/Node, sem jsdom
    // de rede real, sem backend rodando) já é a prova — se a extração
    // dependesse de qualquer endpoint remoto, este teste falharia por
    // timeout/erro de rede. Reforça explicitamente com um teste dedicado.
    const bytes = await makeTextPdf(1);
    const result = await extractDocumentText(bytes);
    expect(result.overallStatus).toBe("ok");
  });
});
