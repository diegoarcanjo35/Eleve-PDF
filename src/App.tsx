import { useCallback, useRef, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { FileCard } from "@/components/FileCard";
import { ProgressBar } from "@/components/ProgressBar";
import { CompressPanel } from "@/components/CompressPanel";
import { SplitPanel } from "@/components/SplitPanel";
import { CompressResultView, type CompressResultData } from "@/components/CompressResultView";
import { SplitResultView, type SplitPartView } from "@/components/SplitResultView";
import { Footer } from "@/components/Footer";
import { requestValidate, requestCompress, requestSplit } from "@/lib/pdfWorkerClient";
import { PdfAppError, messageFor } from "@/lib/errors";
import { downloadBytes } from "@/lib/download";
import { partFileName, compressedFileName } from "@/lib/filenames";
import { zipFiles } from "@/lib/zip";
import type { CompressionLevel } from "@/lib/compressionLevels";

type ValidationState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "ready"; pageCount: number }
  | { status: "error"; message: string };

type Tool = "compress" | "split";

interface SplitPartInternal extends SplitPartView {
  bytes: Uint8Array;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationState>({ status: "idle" });
  const [activeTool, setActiveTool] = useState<Tool>("compress");
  const fileBufferRef = useRef<ArrayBuffer | null>(null);

  const [compressRunning, setCompressRunning] = useState(false);
  const [compressProgress, setCompressProgress] = useState<{ current: number; total: number } | null>(null);
  const [compressResult, setCompressResult] = useState<(CompressResultData & { bytes: Uint8Array }) | null>(null);
  const [compressError, setCompressError] = useState<string | null>(null);

  const [splitRunning, setSplitRunning] = useState(false);
  const [splitProgress, setSplitProgress] = useState<{ current: number; total: number } | null>(null);
  const [splitParts, setSplitParts] = useState<SplitPartInternal[] | null>(null);
  const [splitMaxBytes, setSplitMaxBytes] = useState<number | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [compressingPartIndex, setCompressingPartIndex] = useState<number | null>(null);
  const splitCancelRef = useRef<(() => void) | null>(null);

  const resetResults = useCallback(() => {
    setCompressRunning(false);
    setCompressProgress(null);
    setCompressResult(null);
    setCompressError(null);
    setSplitRunning(false);
    setSplitProgress(null);
    setSplitParts(null);
    setSplitMaxBytes(null);
    setSplitError(null);
    setCompressingPartIndex(null);
  }, []);

  const handleFileSelected = useCallback(
    async (selected: File) => {
      resetResults();
      setFile(selected);
      setValidation({ status: "validating" });
      try {
        const buffer = await selected.arrayBuffer();
        fileBufferRef.current = buffer;
        const { promise } = requestValidate(buffer.slice(0), selected.size);
        const result = await promise;
        setValidation({ status: "ready", pageCount: result.pageCount });
      } catch (error) {
        const appError =
          error instanceof PdfAppError
            ? error
            : new PdfAppError("unknown", "Erro desconhecido ao validar o arquivo.");
        setValidation({ status: "error", message: messageFor(appError.code) });
      }
    },
    [resetResults],
  );

  const handleRemove = useCallback(() => {
    setFile(null);
    fileBufferRef.current = null;
    setValidation({ status: "idle" });
    resetResults();
  }, [resetResults]);

  const handleCompress = useCallback(
    async (level: CompressionLevel) => {
      if (!fileBufferRef.current || !file) return;
      setCompressRunning(true);
      setCompressError(null);
      setCompressResult(null);
      setCompressProgress({ current: 0, total: 0 });
      try {
        const { promise } = requestCompress(fileBufferRef.current.slice(0), level, (progress) => {
          if (progress.stage === "recompressing-images") {
            setCompressProgress({ current: progress.imagesProcessed, total: progress.imagesTotal });
          }
        });
        const response = await promise;
        const bytes = new Uint8Array(response.bytes);
        setCompressResult({
          level,
          originalBytes: file.size,
          finalBytes: bytes.byteLength,
          imagesFound: response.imagesFound,
          imagesRecompressed: response.imagesRecompressed,
          usedImageRecompression: response.usedImageRecompression,
          fileName: file.name,
          bytes,
        });
      } catch (error) {
        const appError =
          error instanceof PdfAppError
            ? error
            : new PdfAppError("unknown", "Erro desconhecido ao compactar.");
        setCompressError(messageFor(appError.code));
      } finally {
        setCompressRunning(false);
        setCompressProgress(null);
      }
    },
    [file],
  );

  const handleSplit = useCallback(
    async (maxBytes: number) => {
      if (!fileBufferRef.current || !file) return;
      setSplitRunning(true);
      setSplitError(null);
      setSplitParts(null);
      setSplitMaxBytes(maxBytes);
      setSplitProgress({ current: 0, total: 0 });
      try {
        const { promise, cancel } = requestSplit(fileBufferRef.current.slice(0), maxBytes, (progress) => {
          if (progress.stage === "packing") {
            setSplitProgress({ current: progress.pagesProcessed, total: progress.totalPages });
          }
        });
        splitCancelRef.current = cancel;
        const response = await promise;
        const total = response.parts.length;
        const parts: SplitPartInternal[] = response.parts.map((part) => ({
          index: part.index,
          fileName: partFileName(file.name, part.index, total),
          pageCount: part.pageIndices.length,
          sizeBytes: part.sizeBytes,
          exceedsLimit: part.exceedsLimit,
          bytes: new Uint8Array(part.bytes),
        }));
        setSplitParts(parts);
      } catch (error) {
        const appError =
          error instanceof PdfAppError
            ? error
            : new PdfAppError("unknown", "Erro desconhecido ao dividir.");
        setSplitError(messageFor(appError.code));
      } finally {
        setSplitRunning(false);
        setSplitProgress(null);
        splitCancelRef.current = null;
      }
    },
    [file],
  );

  const handleCompressOversizedPart = useCallback(
    async (index: number) => {
      if (!splitParts) return;
      const part = splitParts.find((item) => item.index === index);
      if (!part) return;
      setCompressingPartIndex(index);
      try {
        const { promise } = requestCompress(
          part.bytes.buffer.slice(part.bytes.byteOffset, part.bytes.byteOffset + part.bytes.byteLength) as ArrayBuffer,
          "maxima",
        );
        const response = await promise;
        const bytes = new Uint8Array(response.bytes);
        setSplitParts((prev) =>
          prev
            ? prev.map((item) =>
                item.index === index
                  ? {
                      ...item,
                      bytes,
                      sizeBytes: bytes.byteLength,
                      exceedsLimit: splitMaxBytes ? bytes.byteLength > splitMaxBytes : item.exceedsLimit,
                    }
                  : item,
              )
            : prev,
        );
      } catch {
        setSplitError("Não foi possível compactar esta parte automaticamente.");
      } finally {
        setCompressingPartIndex(null);
      }
    },
    [splitParts, splitMaxBytes],
  );

  const handleDownloadCompress = useCallback(() => {
    if (!compressResult || !file) return;
    downloadBytes(compressResult.bytes, compressedFileName(file.name));
  }, [compressResult, file]);

  const handleDownloadPart = useCallback(
    (index: number) => {
      const part = splitParts?.find((item) => item.index === index);
      if (!part) return;
      downloadBytes(part.bytes, part.fileName);
    },
    [splitParts],
  );

  const handleDownloadZip = useCallback(async () => {
    if (!splitParts) return;
    const zipped = await zipFiles(splitParts.map((part) => ({ name: part.fileName, bytes: part.bytes })));
    const baseName = file ? file.name.replace(/\.pdf$/i, "") : "elevepdf";
    downloadBytes(zipped, `${baseName}-partes.zip`, "application/zip");
  }, [splitParts, file]);

  const isReady = validation.status === "ready";

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="brand">
          <span className="brand__eleve">Eleve</span>
          <span className="brand__pdf">PDF</span>
        </p>
        <p className="tagline">Seu PDF no tamanho certo.</p>
      </header>

      <main className="app-main">
        {!file ? (
          <UploadZone onFileSelected={handleFileSelected} />
        ) : (
          <FileCard
            fileName={file.name}
            sizeBytes={file.size}
            pageCount={validation.status === "ready" ? validation.pageCount : null}
            status={
              validation.status === "validating"
                ? "validating"
                : validation.status === "error"
                  ? "error"
                  : "ready"
            }
            errorMessage={validation.status === "error" ? validation.message : undefined}
            onRemove={handleRemove}
          />
        )}

        {isReady && (
          <section className="tools" aria-label="Ferramentas">
            <div className="tabs" role="tablist" aria-label="Escolha a operação">
              <button
                type="button"
                role="tab"
                aria-selected={activeTool === "compress"}
                className={`tab${activeTool === "compress" ? " tab--selected" : ""}`}
                onClick={() => setActiveTool("compress")}
              >
                Compactar PDF
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTool === "split"}
                className={`tab${activeTool === "split" ? " tab--selected" : ""}`}
                onClick={() => setActiveTool("split")}
              >
                Dividir por tamanho
              </button>
            </div>

            {activeTool === "compress" && (
              <div role="tabpanel">
                <CompressPanel disabled={!isReady} running={compressRunning} onCompress={handleCompress} />
                {compressRunning && (
                  <ProgressBar
                    label="Compactando imagens…"
                    current={compressProgress?.current ?? 0}
                    total={compressProgress?.total ?? 0}
                  />
                )}
                {compressError && (
                  <p className="notice notice--error" role="alert">
                    {compressError}
                  </p>
                )}
                {compressResult && (
                  <CompressResultView result={compressResult} onDownload={handleDownloadCompress} />
                )}
              </div>
            )}

            {activeTool === "split" && (
              <div role="tabpanel">
                <SplitPanel disabled={!isReady} running={splitRunning} onSplit={handleSplit} />
                {splitRunning && (
                  <ProgressBar
                    label="Dividindo páginas…"
                    current={splitProgress?.current ?? 0}
                    total={splitProgress?.total ?? 0}
                    onCancel={() => splitCancelRef.current?.()}
                  />
                )}
                {splitError && (
                  <p className="notice notice--error" role="alert">
                    {splitError}
                  </p>
                )}
                {splitParts && splitMaxBytes !== null && (
                  <SplitResultView
                    parts={splitParts}
                    maxBytes={splitMaxBytes}
                    onDownloadPart={handleDownloadPart}
                    onDownloadZip={handleDownloadZip}
                    onCompressOversizedPart={handleCompressOversizedPart}
                    compressingPartIndex={compressingPartIndex}
                  />
                )}
              </div>
            )}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
