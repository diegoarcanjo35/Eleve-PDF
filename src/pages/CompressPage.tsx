import { useCallback, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { FileCard } from "@/components/FileCard";
import { ProgressBar } from "@/components/ProgressBar";
import { CompressPanel } from "@/components/CompressPanel";
import { CompressResultView, type CompressResultData } from "@/components/CompressResultView";
import { ToolPageLayout } from "@/components/layout/ToolPageLayout";
import { usePdfUpload } from "@/hooks/usePdfUpload";
import { requestCompress } from "@/lib/pdfWorkerClient";
import { PdfAppError, messageFor } from "@/lib/errors";
import { downloadBytes } from "@/lib/download";
import { compressedFileName } from "@/lib/filenames";
import type { CompressionLevel } from "@/lib/compressionLevels";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

export default function CompressPage() {
  useDocumentMeta(
    "Compactar PDF — ElevePDF",
    "Reduza o tamanho do seu PDF direto no navegador, sem enviar o arquivo para servidores. Nunca entrega uma versão maior que o original.",
  );

  const [compressRunning, setCompressRunning] = useState(false);
  const [compressProgress, setCompressProgress] = useState<{ current: number; total: number } | null>(null);
  const [compressResult, setCompressResult] = useState<(CompressResultData & { bytes: Uint8Array }) | null>(null);
  const [compressError, setCompressError] = useState<string | null>(null);

  const resetResults = useCallback(() => {
    setCompressRunning(false);
    setCompressProgress(null);
    setCompressResult(null);
    setCompressError(null);
  }, []);

  const { file, validation, fileBufferRef, handleFileSelected, handleRemove } = usePdfUpload(resetResults);

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
          outcome: response.outcome,
          originalBytes: file.size,
          finalBytes: response.finalBytes,
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
    [file, fileBufferRef],
  );

  const handleDownloadCompress = useCallback(() => {
    if (!compressResult || !file) return;
    downloadBytes(compressResult.bytes, compressedFileName(file.name));
  }, [compressResult, file]);

  const isReady = validation.status === "ready";

  return (
    <ToolPageLayout
      title="Compactar PDF"
      description="Reduza o tamanho do seu PDF sem entregar uma versão maior que o original."
      crossLink={{ label: "Dividir PDF por tamanho", to: "/dividir-pdf-por-tamanho" }}
    >
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
        <section className="tools" aria-label="Compactar PDF">
          {validation.status === "ready" && validation.structure.hasDigitalSignatureFields && (
            <p className="notice notice--warning">
              Este PDF contém um campo de assinatura digital. A <strong>aparência</strong> da
              assinatura pode permanecer no arquivo processado, mas qualquer reserialização ou
              divisão <strong>invalida sua validade criptográfica</strong> — como acontece em
              qualquer ferramenta que reescreve um PDF.
            </p>
          )}

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
          {compressResult && <CompressResultView result={compressResult} onDownload={handleDownloadCompress} />}
        </section>
      )}
    </ToolPageLayout>
  );
}
