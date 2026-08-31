import * as pdfjsLib from "pdfjs-dist";
import { PdfAppError } from "./errors";
import { MAX_FILE_SIZE_BYTES, MAX_PAGE_COUNT } from "./limits";

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

/** Confere a assinatura real do arquivo (magic bytes), não apenas a extensão. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return PDF_MAGIC_BYTES.every((byte, index) => bytes[index] === byte);
}

export interface ValidatedPdf {
  pageCount: number;
}

/**
 * Valida o conteúdo real do PDF e classifica falhas de forma específica
 * (inválido / corrompido / protegido por senha), usando pdfjs-dist como
 * parser de referência — mais rigoroso que apenas tentar reserializar.
 */
export async function validatePdfBytes(
  bytes: Uint8Array,
  fileSizeBytes: number,
): Promise<ValidatedPdf> {
  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new PdfAppError("too-large", "Arquivo acima do limite suportado.");
  }

  if (!hasPdfSignature(bytes)) {
    throw new PdfAppError("not-a-pdf", "Assinatura de arquivo PDF ausente.");
  }

  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
  });

  try {
    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    await doc.destroy();

    if (pageCount > MAX_PAGE_COUNT) {
      throw new PdfAppError(
        "too-many-pages",
        `PDF possui ${pageCount} páginas, acima do limite de ${MAX_PAGE_COUNT}.`,
      );
    }
    if (pageCount < 1) {
      throw new PdfAppError("corrupted", "PDF sem páginas legíveis.");
    }

    return { pageCount };
  } catch (error) {
    if (error instanceof PdfAppError) throw error;

    const name = (error as { name?: string } | undefined)?.name ?? "";
    if (name === "PasswordException") {
      throw new PdfAppError("password-protected", "PDF protegido por senha.");
    }
    if (name === "InvalidPDFException") {
      throw new PdfAppError("corrupted", "Estrutura de PDF inválida.");
    }
    if (
      error instanceof RangeError ||
      (error instanceof Error && /memory/i.test(error.message))
    ) {
      throw new PdfAppError("out-of-memory", "Memória insuficiente para ler o arquivo.");
    }
    throw new PdfAppError("corrupted", "Não foi possível interpretar o PDF.");
  }
}
