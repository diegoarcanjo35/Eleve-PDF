import { useCallback, useRef, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { FileCard } from "@/components/FileCard";
import { ProgressBar } from "@/components/ProgressBar";
import { SplitPanel } from "@/components/SplitPanel";
import { SplitResultView, type SplitPartView } from "@/components/SplitResultView";
import { ToolPageLayout } from "@/components/layout/ToolPageLayout";
import { usePdfUpload } from "@/hooks/usePdfUpload";
import { requestCompress, requestSplit } from "@/lib/pdfWorkerClient";
import { PdfAppError, messageFor } from "@/lib/errors";
import { downloadBytes } from "@/lib/download";
import { partFileName } from "@/lib/filenames";
import { zipFiles } from "@/lib/zip";
import { hasSplitRiskyStructures } from "@/lib/structuralFindings";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

interface SplitPartInternal extends SplitPartView {
  bytes: Uint8Array;
}

export default function SplitPage() {
  useDocumentMeta(
    "Dividir PDF por tamanho — ElevePDF",
    "Divida seu PDF em partes dentro do limite de tamanho escolhido, sem cortar páginas ao meio — direto no navegador.",
  );

  const [splitRunning, setSplitRunning] = useState(false);
  const [splitProgress, setSplitProgress] = useState<{ current: number; total: number } | null>(null);
  const [splitParts, setSplitParts] = useState<SplitPartInternal[] | null>(null);
  const [splitMaxBytes, setSplitMaxBytes] = useState<number | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [compressingPartIndex, setCompressingPartIndex] = useState<number | null>(null);
  const [splitRiskAcknowledged, setSplitRiskAcknowledged] = useState(false);
  const splitCancelRef = useRef<(() => void) | null>(null);

  const resetResults = useCallback(() => {
    setSplitRunning(false);
    setSplitProgress(null);
    setSplitParts(null);
    setSplitMaxBytes(null);
    setSplitError(null);
    setCompressingPartIndex(null);
    setSplitRiskAcknowledged(false);
  }, []);

  const { file, validation, fileBufferRef, handleFileSelected, handleRemove } = usePdfUpload(resetResults);

  const splitHasRiskyStructures =
    validation.status === "ready" && hasSplitRiskyStructures(validation.structure);

  const handleSplit = useCallback(
    async (maxBytes: number) => {
      if (!fileBufferRef.current || !file) return;
      if (splitHasRiskyStructures && !splitRiskAcknowledged) return;
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
    [file, fileBufferRef, splitHasRiskyStructures, splitRiskAcknowledged],
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
    <ToolPageLayout
      title="Dividir PDF por tamanho"
      description="Divida o PDF usando um tamanho máximo como alvo, sem cortar páginas ao meio."
      crossLink={{ label: "Compactar PDF", to: "/compactar-pdf" }}
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
        <section className="tools" aria-label="Dividir PDF por tamanho">
          {validation.status === "ready" && validation.structure.hasDigitalSignatureFields && (
            <p className="notice notice--warning">
              Este PDF contém um campo de assinatura digital. A <strong>aparência</strong> da
              assinatura pode permanecer no arquivo processado, mas qualquer reserialização ou
              divisão <strong>invalida sua validade criptográfica</strong> — como acontece em
              qualquer ferramenta que reescreve um PDF.
            </p>
          )}

          {splitHasRiskyStructures && (
            <div className="notice notice--warning split-risk-notice">
              <p>
                Este PDF possui estruturas de nível de documento (
                {validation.status === "ready" && !validation.structure.analyzedSuccessfully
                  ? "não foi possível analisar completamente a estrutura deste PDF"
                  : [
                      validation.status === "ready" && validation.structure.hasAcroForm
                        ? "formulário (AcroForm)"
                        : null,
                      validation.status === "ready" && validation.structure.hasOutlines
                        ? "marcadores/outline"
                        : null,
                      validation.status === "ready" && validation.structure.hasNamedDestinations
                        ? "destinos nomeados"
                        : null,
                      validation.status === "ready" && validation.structure.pagesWithWidgetAnnotations > 0
                        ? "campos de formulário em página"
                        : null,
                      validation.status === "ready" && validation.structure.hasDocumentMetadataStream
                        ? "metadados do documento"
                        : null,
                      validation.status === "ready" && validation.structure.pagesWithLinkAnnotations > 0
                        ? "links presentes nas páginas"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                ) que <strong>cada parte da divisão, sendo um documento novo, pode não
                preservar</strong>. Links externos simples podem permanecer, mas links internos e
                destinos entre páginas ou partes não são garantidos. O registro do formulário,
                marcadores/destinos e os metadados do documento original também não são recriados
                em cada parte. O resultado não é equivalente ao documento original.
              </p>
              <label className="split-risk-notice__confirm">
                <input
                  type="checkbox"
                  checked={splitRiskAcknowledged}
                  onChange={(event) => setSplitRiskAcknowledged(event.target.checked)}
                />
                Entendo o risco e quero continuar mesmo assim
              </label>
            </div>
          )}

          <SplitPanel
            disabled={!isReady || (splitHasRiskyStructures && !splitRiskAcknowledged)}
            running={splitRunning}
            onSplit={handleSplit}
          />
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
        </section>
      )}
    </ToolPageLayout>
  );
}
