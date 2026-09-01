import type { CompressionLevel, CompressOutcome, CompressProgress } from "@/lib/pdfCompress";
import type { SplitProgress } from "@/lib/pdfSplit";
import type { MergeProgress } from "@/lib/pdfMerge";
import type { PdfErrorCode } from "@/lib/errors";
import type { StructuralFindings } from "@/lib/structuralAnalysis";

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

export interface MergeRequest {
  id: string;
  type: "merge";
  /** Bytes de cada PDF, na ordem em que devem ser juntados. */
  filesBytes: ArrayBuffer[];
}

export interface CancelRequest {
  id: string;
  type: "cancel";
}

export type WorkerRequest =
  | ValidateRequest
  | CompressRequest
  | SplitRequest
  | MergeRequest
  | CancelRequest;

export interface ProgressMessage {
  id: string;
  type: "progress";
  progress: SplitProgress | CompressProgress | MergeProgress;
}

export interface ValidateSuccessMessage {
  id: string;
  type: "validate-success";
  pageCount: number;
  structure: StructuralFindings;
}

export interface CompressSuccessMessage {
  id: string;
  type: "compress-success";
  bytes: ArrayBuffer;
  outcome: CompressOutcome;
  finalBytes: number;
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

export interface MergeSuccessMessage {
  id: string;
  type: "merge-success";
  bytes: ArrayBuffer;
  totalPages: number;
  fileCount: number;
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
  | MergeSuccessMessage
  | ErrorMessage;
