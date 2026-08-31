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
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
    page.drawText(`ElevePDF — fixture de teste — página ${pageNumber}`, {
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
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([595, 842]);
    // Cada página recebe uma imagem JPEG DIFERENTE (não reaproveitada), grande o
    // bastante para, sozinha, ultrapassar o piso mínimo de divisão de 64 KB —
    // usada para demonstrar o caso "página isolada maior que o limite".
    const jpegBytes = synthesizeJpeg(1600, 1200, 90 - i);
    const image = await doc.embedJpg(jpegBytes);
    const { width, height } = image.scaleToFit(495, 700);
    page.drawImage(image, { x: 50, y: 90, width, height });
  }
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
