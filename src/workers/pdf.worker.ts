/// <reference lib="webworker" />
import * as pdfjsLib from "pdfjs-dist";
import { validatePdfBytes } from "@/lib/validation";
import { compressPdf } from "@/lib/pdfCompress";
import { splitPdfBySize } from "@/lib/pdfSplit";
import { PdfAppError } from "@/lib/errors";
import type { WorkerRequest, WorkerResponse } from "@/types/worker";

// pdfjs-dist precisa do seu próprio worker script mesmo quando já estamos dentro
// de um Web Worker dedicado (workers aninhados são suportados pelos navegadores
// modernos). O padrão `new URL(..., import.meta.url)` deixa o Vite resolver e
// versionar esse asset automaticamente tanto em dev quanto no build de produção.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

const cancelledIds = new Set<string>();

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(message, transfer);
}

function toAppError(error: unknown): PdfAppError {
  if (error instanceof PdfAppError) return error;
  if (error instanceof RangeError) {
    return new PdfAppError("out-of-memory", "Memória insuficiente durante o processamento.");
  }
  return new PdfAppError(
    "processing-failed",
    error instanceof Error ? error.message : "Falha desconhecida durante o processamento.",
  );
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "cancel") {
    cancelledIds.add(request.id);
    return;
  }

  try {
    if (request.type === "validate") {
      const bytes = new Uint8Array(request.fileBytes);
      const result = await validatePdfBytes(bytes, request.fileSize);
      post({
        id: request.id,
        type: "validate-success",
        pageCount: result.pageCount,
        structure: result.structure,
      });
      return;
    }

    if (request.type === "compress") {
      const bytes = new Uint8Array(request.fileBytes);
      const result = await compressPdf(bytes, request.level, (progress) => {
        post({ id: request.id, type: "progress", progress });
      });
      const outBuffer = result.bytes.buffer.slice(
        result.bytes.byteOffset,
        result.bytes.byteOffset + result.bytes.byteLength,
      ) as ArrayBuffer;
      post(
        {
          id: request.id,
          type: "compress-success",
          bytes: outBuffer,
          outcome: result.outcome,
          finalBytes: result.finalBytes,
          imagesFound: result.imagesFound,
          imagesRecompressed: result.imagesRecompressed,
          skips: result.skips,
          usedImageRecompression: result.usedImageRecompression,
        },
        [outBuffer],
      );
      return;
    }

    if (request.type === "split") {
      const bytes = new Uint8Array(request.fileBytes);
      const result = await splitPdfBySize(
        bytes,
        request.maxBytes,
        (progress) => post({ id: request.id, type: "progress", progress }),
        () => cancelledIds.has(request.id),
      );
      const transferBuffers: ArrayBuffer[] = [];
      const parts = result.parts.map((part) => {
        const buffer = part.bytes.buffer.slice(
          part.bytes.byteOffset,
          part.bytes.byteOffset + part.bytes.byteLength,
        ) as ArrayBuffer;
        transferBuffers.push(buffer);
        return {
          index: part.index,
          pageIndices: part.pageIndices,
          bytes: buffer,
          sizeBytes: part.sizeBytes,
          exceedsLimit: part.exceedsLimit,
        };
      });
      post(
        { id: request.id, type: "split-success", totalPages: result.totalPages, parts },
        transferBuffers,
      );
      return;
    }
  } catch (error) {
    const appError = toAppError(error);
    post({ id: request.id, type: "error", code: appError.code, message: appError.message });
  } finally {
    cancelledIds.delete(request.id);
  }
});
