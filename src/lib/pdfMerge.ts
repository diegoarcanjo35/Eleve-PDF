import { PDFDocument } from "pdf-lib";
import { PdfAppError } from "./errors";
import { MIN_MERGE_FILE_COUNT } from "./limits";

export interface MergeProgress {
  stage: "reading" | "merging" | "finalizing";
  filesProcessed: number;
  totalFiles: number;
}

export interface MergeResult {
  bytes: Uint8Array;
  totalPages: number;
  fileCount: number;
}

/**
 * Junta dois ou mais PDFs, na ordem em que os bytes são recebidos, em um
 * único PDF novo.
 *
 * Como a divisão (`pdfSplit.ts`), o resultado é sempre um documento criado do
 * zero (`PDFDocument.create()`) com páginas copiadas (`copyPages`) dos
 * originais — nunca uma concatenação bruta dos bytes originais. Isso
 * preserva a aparência visual e o texto pesquisável de cada página (o
 * conteúdo da página é copiado como está, não rasterizado), mas
 * deliberadamente NÃO tenta recriar estruturas de nível de documento dos
 * originais (AcroForm, Outlines, Names/Dests, metadados do catálogo) — o
 * `pdf-lib` não copia essas estruturas ao copiar páginas, e fingir que o
 * resultado é equivalente aos documentos originais seria enganoso. A UI
 * (`MergePage`) é responsável por avisar sobre isso antes de processar,
 * usando o mesmo analisador estrutural (`analyzePdfStructure`) já usado pela
 * divisão.
 */
export async function mergePdfs(
  filesBytes: Uint8Array[],
  onProgress?: (progress: MergeProgress) => void,
  isCancelled?: () => boolean,
): Promise<MergeResult> {
  if (filesBytes.length < MIN_MERGE_FILE_COUNT) {
    throw new PdfAppError("processing-failed", "São necessários pelo menos dois PDFs para juntar.");
  }

  const totalFiles = filesBytes.length;
  onProgress?.({ stage: "reading", filesProcessed: 0, totalFiles });

  const output = await PDFDocument.create();
  let totalPages = 0;

  for (let i = 0; i < totalFiles; i += 1) {
    if (isCancelled?.()) {
      throw new PdfAppError("processing-failed", "Operação cancelada pelo usuário.");
    }

    const source = await PDFDocument.load(filesBytes[i]!, { ignoreEncryption: false });
    const pageIndices = source.getPageIndices();
    const copiedPages = await output.copyPages(source, pageIndices);
    copiedPages.forEach((page) => output.addPage(page));
    totalPages += pageIndices.length;

    onProgress?.({ stage: "merging", filesProcessed: i + 1, totalFiles });
  }

  onProgress?.({ stage: "finalizing", filesProcessed: totalFiles, totalFiles });
  const bytes = await output.save({ useObjectStreams: true });

  return { bytes, totalPages, fileCount: totalFiles };
}
