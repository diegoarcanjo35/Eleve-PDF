import type { CompressionLevel, CompressProgress } from "@/lib/pdfCompress";
import type { SplitProgress } from "@/lib/pdfSplit";
import type { PdfErrorCode } from "@/lib/errors";

export interface ValidateRequest {
  id: string;
  type: "validate";
  fileBytes: ArrayBuffer;
  fileSize: number;
}

export interface CompressRequest {
  id: string;
  type: "compress";
  fileBytes: ArrayBuffer;
  level: CompressionLevel;
}

export interface SplitRequest {
  id: string;
  type: "split";
  fileBytes: ArrayBuffer;
  maxBytes: number;
}

export interface CancelRequest {
  id: string;
  type: "cancel";
}

export type WorkerRequest =
  | ValidateRequest
  | CompressRequest
  | SplitRequest
  | CancelRequest;

export interface ProgressMessage {
  id: string;
  type: "progress";
  progress: SplitProgress | CompressProgress;
}

export interface ValidateSuccessMessage {
  id: string;
  type: "validate-success";
  pageCount: number;
}

export interface CompressSuccessMessage {
  id: string;
  type: "compress-success";
  bytes: ArrayBuffer;
  imagesFound: number;
  imagesRecompressed: number;
  skips: { reason: string; count: number }[];
  usedImageRecompression: boolean;
}

export interface SplitSuccessMessage {
  id: string;
  type: "split-success";
  totalPages: number;
  parts: {
    index: number;
    pageIndices: number[];
    bytes: ArrayBuffer;
    sizeBytes: number;
    exceedsLimit: boolean;
  }[];
}

export interface ErrorMessage {
  id: string;
  type: "error";
  code: PdfErrorCode;
  message: string;
}

export type WorkerResponse =
  | ProgressMessage
  | ValidateSuccessMessage
  | CompressSuccessMessage
  | SplitSuccessMessage
  | ErrorMessage;
