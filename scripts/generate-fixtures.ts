/**
 * Gera fixtures de PDF REAIS (nenhum documento pessoal) usadas pelos testes
 * automatizados e end-to-end. Roda em Node, fora do navegador — usa `pdf-lib`
 * para montar a estrutura do PDF e `jpeg-js` para codificar uma imagem JPEG
 * genuína (um gradiente sintético), permitindo testar a recompressão real de
 * imagens sem depender de nenhum arquivo externo.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFArray, PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";
import jpeg from "jpeg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures");

function synthesizeJpeg(width: number, height: number, quality: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = Math.floor((x / width) * 255);
      data[i + 1] = Math.floor((y / height) * 255);
      data[i + 2] = Math.floor(((x + y) / (width + height)) * 255);
      data[i + 3] = 255;
    }
  }
  const encoded = jpeg.encode({ data, width, height }, quality);
  return new Uint8Array(encoded.data);
}

async function addTextPages(doc: PDFDocument, count: number, startingAt = 1) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < count; i += 1) {
    const page = doc.addPage([595, 842]);
    const pageNumber = startingAt + i;
    // O token "pagina-numero-N" (sem acentos, formato estável) é o que os testes
    // E2E procuram no stream de conteúdo decodificado para confirmar ordem e que
    // o texto permanece pesquisável (não rasterizado) após processar o PDF.
    page.drawText(`ElevePDF — fixture de teste — página ${pageNumber} — pagina-numero-${pageNumber}`, {
      x: 50,
      y: 780,
      size: 16,
      font,
      color: rgb(0.06, 0.09, 0.12),
    });
    const paragraph =
      "Este conteúdo é gerado automaticamente pelo próprio projeto ElevePDF para " +
      "validar divisão e compactação de PDFs, sem usar nenhum documento pessoal. ".repeat(6);
    page.drawText(wrapText(paragraph, 90), {
      x: 50,
      y: 700,
      size: 11,
      font,
      color: rgb(0.2, 0.22, 0.28),
      lineHeight: 16,
      maxWidth: 495,
    });
  }
}

function wrapText(text: string, maxCharsPerLine: number): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

async function buildSimpleOnePage() {
  const doc = await PDFDocument.create();
  await addTextPages(doc, 1);
  return doc.save();
}

async function buildMultiPageText(pageCount: number) {
  const doc = await PDFDocument.create();
  await addTextPages(doc, pageCount);
  return doc.save();
}

async function buildWithImages(pageCount: number) {
  const doc = await PDFDocument.create();
  await addTextPages(doc, pageCount);
  const jpegBytes = synthesizeJpeg(900, 700, 92);
  const image = await doc.embedJpg(jpegBytes);
  const pages = doc.getPages();
  for (const page of pages) {
    const { width, height } = image.scaleToFit(495, 500);
    page.drawImage(image, { x: 50, y: 120, width, height });
  }
  return doc.save();
}

async function buildLargeWithUniqueImages(pageCount: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([595, 842]);
    // Marca de texto pesquisável e identificável, para os testes E2E poderem
    // confirmar a ORDEM real das páginas em cada parte gerada (não apenas a
    // contagem), reabrindo o PDF baixado e extraindo o texto de cada página.
    page.drawText(`ElevePDF fixture — pagina-numero-${i + 1}`, {
      x: 40,
      y: 800,
      size: 14,
      font,
      color: rgb(0.05, 0.08, 0.12),
    });
    // Cada página recebe uma imagem JPEG DIFERENTE (não reaproveitada), grande o
    // bastante para, sozinha, ultrapassar o piso mínimo de divisão de 64 KB —
    // usada para demonstrar o caso "página isolada maior que o limite" e para
    // forçar divisão em múltiplas partes reais dentro dos limites da interface.
    const jpegBytes = synthesizeJpeg(1600, 1200, 90 - i);
    const image = await doc.embedJpg(jpegBytes);
    const { width, height } = image.scaleToFit(495, 680);
    page.drawImage(image, { x: 50, y: 90, width, height });
  }
  return doc.save();
}

/**
 * Fixtures dedicadas ao E2E de "Juntar PDFs" (Fase 3.1) — dois documentos
 * PEQUENOS e distintos, usados como fontes reais da junção. A prova de ordem
 * no E2E não depende do nome do arquivo: cada fixture tem um TAMANHO DE
 * PÁGINA próprio (assinatura estrutural, verificável via page.getSize() no
 * PDF baixado) e um marcador de texto próprio embutido em cada página
 * ("juntar-fonte-a-pagina-N" / "juntar-fonte-b-pagina-N"), extraível tanto do
 * stream de conteúdo (pdf-lib) quanto via extração real de texto (pdfjs-dist).
 */
async function buildMergeSourceA() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pageCount = 2;
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([400, 600]);
    const n = i + 1;
    page.drawText(`ElevePDF fixture — juntar-fonte-a-pagina-${n}`, {
      x: 30,
      y: 560,
      size: 14,
      font,
      color: rgb(0.06, 0.09, 0.12),
    });
  }
  return doc.save();
}

async function buildMergeSourceB() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pageCount = 3;
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([300, 500]);
    const n = i + 1;
    page.drawText(`ElevePDF fixture — juntar-fonte-b-pagina-${n}`, {
      x: 30,
      y: 460,
      size: 14,
      font,
      color: rgb(0.06, 0.09, 0.12),
    });
  }
  return doc.save();
}

async function buildWithSensitiveStructures() {
  const doc = await PDFDocument.create();
  const form = doc.getForm();
  const page1 = doc.addPage([595, 842]);
  const page2 = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page1.drawText("Pagina 1 — com formulario e link", { x: 40, y: 800, size: 14, font });
  page2.drawText("Pagina 2 — destino do marcador", { x: 40, y: 800, size: 14, font });

  const textField = form.createTextField("nome");
  textField.addToPage(page1, { x: 40, y: 700, width: 200, height: 24 });

  const linkAnnotDict = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [40, 750, 200, 770],
    Border: [0, 0, 0],
    A: doc.context.obj({ Type: "Action", S: "URI", URI: PDFString.of("https://example.com") }),
  });
  const linkAnnotRef = doc.context.register(linkAnnotDict);
  const currentAnnots = page1.node.get(PDFName.of("Annots"));
  const annotsArray = currentAnnots instanceof PDFArray ? currentAnnots : (doc.context.obj([]) as PDFArray);
  annotsArray.push(linkAnnotRef);
  page1.node.set(PDFName.of("Annots"), annotsArray);

  const outlineItemDict = doc.context.obj({
    Title: PDFString.of("Capitulo 2"),
    Dest: doc.context.obj([page2.ref, PDFName.of("Fit")]),
  });
  const outlineItemRef = doc.context.register(outlineItemDict);
  const outlinesDict = doc.context.obj({
    Type: "Outlines",
    First: outlineItemRef,
    Last: outlineItemRef,
    Count: 1,
  });
  doc.catalog.set(PDFName.of("Outlines"), doc.context.register(outlinesDict));

  return doc.save();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const simple = await buildSimpleOnePage();
  await writeFile(path.join(OUT_DIR, "simple-1-page.pdf"), simple);

  const multiPage = await buildMultiPageText(14);
  await writeFile(path.join(OUT_DIR, "multi-page-text.pdf"), multiPage);

  const withImages = await buildWithImages(6);
  await writeFile(path.join(OUT_DIR, "with-images.pdf"), withImages);

  const largeUniqueImages = await buildLargeWithUniqueImages(5);
  await writeFile(path.join(OUT_DIR, "large-unique-images.pdf"), largeUniqueImages);

  const sensitiveStructures = await buildWithSensitiveStructures();
  await writeFile(path.join(OUT_DIR, "sensitive-structures.pdf"), sensitiveStructures);

  const mergeSourceA = await buildMergeSourceA();
  await writeFile(path.join(OUT_DIR, "merge-source-a.pdf"), mergeSourceA);

  const mergeSourceB = await buildMergeSourceB();
  await writeFile(path.join(OUT_DIR, "merge-source-b.pdf"), mergeSourceB);

  const corruptedSource = await buildSimpleOnePage();
  const corrupted = corruptedSource.slice(0, Math.floor(corruptedSource.length * 0.6));
  await writeFile(path.join(OUT_DIR, "corrupted.pdf"), corrupted);

  await writeFile(path.join(OUT_DIR, "not-a-pdf.txt"), "Este arquivo não é um PDF.\n");

  const rawJpeg = synthesizeJpeg(600, 450, 90);
  await writeFile(path.join(OUT_DIR, "sample-image.jpg"), rawJpeg);

  console.log(`Fixtures geradas em ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
