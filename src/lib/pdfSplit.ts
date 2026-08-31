import { PDFDocument } from "pdf-lib";
import { PdfAppError } from "./errors";

export interface SplitPart {
  index: number;
  pageIndices: number[];
  bytes: Uint8Array;
  sizeBytes: number;
  exceedsLimit: boolean;
}

export interface SplitProgress {
  stage: "reading" | "measuring" | "packing" | "finalizing";
  pagesProcessed: number;
  totalPages: number;
}

export interface SplitResult {
  parts: SplitPart[];
  totalPages: number;
}

async function serializePages(
  source: PDFDocument,
  pageIndices: number[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(source, pageIndices);
  copied.forEach((page) => doc.addPage(page));
  return doc.save({ useObjectStreams: true });
}

/**
 * Divide um PDF em partes cujo tamanho serializado real respeita `maxBytes`.
 *
 * Algoritmo (guloso, medido — não estimado por proporção):
 * 1. Percorre as páginas em ordem, nunca reordenando e nunca cortando uma página ao meio.
 * 2. Para a parte atual, tenta incluir a próxima página e SERIALIZA o PDF resultante
 *    para medir o tamanho real em bytes (recursos compartilhados, fontes e overhead
 *    de estrutura mudam o tamanho final — por isso não é seguro apenas somar tamanhos
 *    proporcionais das páginas).
 * 3. Se ultrapassar o limite, a página fica para a próxima parte e a parte atual é fechada.
 * 4. Se uma única página já ultrapassa o limite sozinha, ela vira uma parte própria,
 *    marcada como `exceedsLimit`, nunca é cortada e nunca é entregue silenciosamente
 *    como se respeitasse o limite pedido.
 */
export async function splitPdfBySize(
  bytes: Uint8Array,
  maxBytes: number,
  onProgress?: (progress: SplitProgress) => void,
  isCancelled?: () => boolean,
): Promise<SplitResult> {
  onProgress?.({ stage: "reading", pagesProcessed: 0, totalPages: 0 });
  const source = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const totalPages = source.getPageCount();

  const parts: SplitPart[] = [];
  let currentPageIndices: number[] = [];
  let pageCursor = 0;

  while (pageCursor < totalPages) {
    if (isCancelled?.()) {
      throw new PdfAppError("processing-failed", "Operação cancelada pelo usuário.");
    }

    onProgress?.({
      stage: "packing",
      pagesProcessed: pageCursor,
      totalPages,
    });

    const candidateIndices = [...currentPageIndices, pageCursor];
    const candidateBytes = await serializePages(source, candidateIndices);

    if (candidateBytes.byteLength <= maxBytes) {
      currentPageIndices = candidateIndices;
      pageCursor += 1;
      continue;
    }

    if (currentPageIndices.length === 0) {
      parts.push({
        index: parts.length + 1,
        pageIndices: candidateIndices,
        bytes: candidateBytes,
        sizeBytes: candidateBytes.byteLength,
        exceedsLimit: true,
      });
      pageCursor += 1;
      currentPageIndices = [];
      continue;
    }

    const finalizedBytes = await serializePages(source, currentPageIndices);
    parts.push({
      index: parts.length + 1,
      pageIndices: currentPageIndices,
      bytes: finalizedBytes,
      sizeBytes: finalizedBytes.byteLength,
      exceedsLimit: false,
    });
    currentPageIndices = [];
  }

  if (currentPageIndices.length > 0) {
    const finalizedBytes = await serializePages(source, currentPageIndices);
    parts.push({
      index: parts.length + 1,
      pageIndices: currentPageIndices,
      bytes: finalizedBytes,
      sizeBytes: finalizedBytes.byteLength,
      exceedsLimit: finalizedBytes.byteLength > maxBytes,
    });
  }

  onProgress?.({ stage: "finalizing", pagesProcessed: totalPages, totalPages });

  return { parts, totalPages };
}
