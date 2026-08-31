/**
 * Utilitários de inspeção de PDF para os testes E2E (rodam em Node, fora do
 * navegador). Usados para comprovar — não apenas assumir — o conteúdo real dos
 * PDFs baixados: número de páginas, ordem, e que o texto permanece pesquisável
 * (busca o texto no stream de conteúdo decodificado, em vez de apenas checar
 * metadados).
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream } from "pdf-lib";
import zlib from "node:zlib";

function resolve(doc: PDFDocument, value: unknown): unknown {
  if (value instanceof PDFRef) return doc.context.lookup(value);
  return value;
}

function decodeStreamContent(stream: PDFRawStream): string {
  try {
    return zlib.inflateSync(Buffer.from(stream.contents)).toString("latin1");
  } catch {
    return Buffer.from(stream.contents).toString("latin1");
  }
}

/**
 * pdf-lib codifica operadores Tj como string hexadecimal `<...>` (em vez de string
 * literal `(...)`) sempre que o texto do trecho contém qualquer caractere fora do
 * intervalo ASCII imprimível simples (ex.: "—", "á"). Para conseguir buscar texto
 * de verdade no stream decodificado, também decodificamos essas sequências hex.
 */
function decodeHexStringLiterals(contentStreamText: string): string {
  return contentStreamText.replace(/<([0-9A-Fa-f]+)>/g, (_match, hex: string) => {
    const evenHex = hex.length % 2 === 0 ? hex : hex + "0";
    let decoded = "";
    for (let i = 0; i < evenHex.length; i += 2) {
      decoded += String.fromCharCode(parseInt(evenHex.slice(i, i + 2), 16));
    }
    return decoded;
  });
}

/** Extrai o conteúdo de texto bruto (decodificado, incluindo strings hex) do stream de conteúdo de uma página. */
export function getPageContentText(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = resolve(doc, page.node.get(PDFName.of("Contents")));

  let raw = "";
  if (contents instanceof PDFRawStream) {
    raw = decodeStreamContent(contents);
  } else if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      const streamObj = resolve(doc, contents.get(i));
      if (streamObj instanceof PDFRawStream) raw += decodeStreamContent(streamObj) + "\n";
    }
  }
  return decodeHexStringLiterals(raw);
}

/** Retorna, em ordem, os números encontrados via o marcador "pagina-numero-N" em cada página. */
export function extractPageNumberMarkers(doc: PDFDocument): number[] {
  const numbers: number[] = [];
  for (let i = 0; i < doc.getPageCount(); i += 1) {
    const text = getPageContentText(doc, i);
    const match = text.match(/pagina-numero-(\d+)/);
    numbers.push(match ? Number(match[1]) : NaN);
  }
  return numbers;
}

/** true se a página tem um recurso de fonte (prova de que NÃO foi rasterizada em uma única imagem). */
export function pageHasFontResource(doc: PDFDocument, pageIndex: number): boolean {
  const page = doc.getPage(pageIndex);
  const resources = resolve(doc, page.node.get(PDFName.of("Resources")));
  if (!(resources instanceof PDFDict)) return false;
  const fonts = resolve(doc, resources.get(PDFName.of("Font")));
  return fonts instanceof PDFDict && fonts.keys().length > 0;
}

export function countImageXObjectsInPage(doc: PDFDocument, pageIndex: number): number {
  const page = doc.getPage(pageIndex);
  const resources = resolve(doc, page.node.get(PDFName.of("Resources")));
  if (!(resources instanceof PDFDict)) return 0;
  const xobjects = resolve(doc, resources.get(PDFName.of("XObject")));
  if (!(xobjects instanceof PDFDict)) return 0;
  let count = 0;
  for (const key of xobjects.keys()) {
    const obj = resolve(doc, xobjects.get(key));
    if (obj instanceof PDFStream && obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") {
      count += 1;
    }
  }
  return count;
}
