import type {
  CompressSuccessMessage,
  SplitSuccessMessage,
  ValidateSuccessMessage,
  WorkerRequest,
  WorkerResponse,
} from "@/types/worker";
import { PdfAppError } from "./errors";
import type { CompressionLevel, CompressProgress } from "./pdfCompress";
import type { SplitProgress } from "./pdfSplit";

let worker: Worker | null = null;
let requestCounter = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/pdf.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

function nextId(): string {
  requestCounter += 1;
  return `req-${requestCounter}-${Date.now()}`;
}

function runRequest<TSuccess extends WorkerResponse>(
  request: WorkerRequest,
  successType: TSuccess["type"],
  onProgress?: (progress: SplitProgress | CompressProgress) => void,
): { promise: Promise<TSuccess>; cancel: () => void } {
  const w = getWorker();
  let settled = false;

  const promise = new Promise<TSuccess>((resolve, reject) => {
    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.id !== request.id) return;

      if (data.type === "progress") {
        onProgress?.(data.progress);
        return;
      }
      if (data.type === "error") {
        settled = true;
        w.removeEventListener("message", handleMessage);
        reject(new PdfAppError(data.code, data.message));
        return;
      }
      if (data.type === successType) {
        settled = true;
        w.removeEventListener("message", handleMessage);
        resolve(data as TSuccess);
      }
    };
    w.addEventListener("message", handleMessage);
    w.postMessage(request, request.type !== "cancel" ? [request.fileBytes] : []);
  });

  const cancel = () => {
    if (settled) return;
    w.postMessage({ id: request.id, type: "cancel" } satisfies WorkerRequest);
  };

  return { promise, cancel };
}

export function requestValidate(file: ArrayBuffer, fileSize: number) {
  const id = nextId();
  return runRequest<ValidateSuccessMessage>(
    { id, type: "validate", fileBytes: file, fileSize },
    "validate-success",
  );
}

export function requestCompress(
  file: ArrayBuffer,
  level: CompressionLevel,
  onProgress?: (progress: CompressProgress) => void,
) {
  const id = nextId();
  return runRequest<CompressSuccessMessage>(
    { id, type: "compress", fileBytes: file, level },
    "compress-success",
    onProgress as (progress: SplitProgress | CompressProgress) => void,
  );
}

export function requestSplit(
  file: ArrayBuffer,
  maxBytes: number,
  onProgress?: (progress: SplitProgress) => void,
) {
  const id = nextId();
  return runRequest<SplitSuccessMessage>(
    { id, type: "split", fileBytes: file, maxBytes },
    "split-success",
    onProgress as (progress: SplitProgress | CompressProgress) => void,
  );
}
