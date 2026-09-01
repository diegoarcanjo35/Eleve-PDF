import { useCallback, useEffect, useRef, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { MergeFileList } from "@/components/MergeFileList";
import { MergePanel } from "@/components/MergePanel";
import { MergeResultView, type MergeResultData } from "@/components/MergeResultView";
import { ProgressBar } from "@/components/ProgressBar";
import { ToolPageLayout } from "@/components/layout/ToolPageLayout";
import { useMultiPdfUpload } from "@/hooks/useMultiPdfUpload";
import { requestMerge } from "@/lib/pdfWorkerClient";
import { PdfAppError, messageFor } from "@/lib/errors";
import { downloadBytes } from "@/lib/download";
import { mergedFileName } from "@/lib/filenames";
import { hasMergeRiskyStructures } from "@/lib/structuralFindings";
import { MIN_MERGE_FILE_COUNT } from "@/lib/limits";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { track } from "@/analytics/client";
import { durationMsToBucket, partsCountToBucket } from "@shared/analytics/events";
import { findSeoPage } from "@shared/seo/pages";

const TOOL_ID = "juntar-pdfs" as const;
const PAGE_META = findSeoPage("/juntar-pdfs")!;

export default function MergePage() {
  useDocumentMeta(PAGE_META);

  useEffect(() => {
    track("tool_open", { tool_id: TOOL_ID });
  }, []);

  const [mergeRunning, setMergeRunning] = useState(false);
  const [mergeProgress, setMergeProgress] = useState<{ current: number; total: number } | null>(null);
  const [mergeResult, setMergeResult] = useState<(MergeResultData & { bytes: Uint8Array }) | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeRiskAcknowledged, setMergeRiskAcknowledged] = useState(false);
  const mergeCancelRef = useRef<(() => void) | null>(null);
  const warningShownRef = useRef(false);

  const resetResults = useCallback(() => {
    setMergeRunning(false);
    setMergeProgress(null);
    setMergeResult(null);
    setMergeError(null);
    setMergeRiskAcknowledged(false);
    warningShownRef.current = false;
  }, []);

  const { entries, notice, addFiles, removeFile, clearAll, moveEntry } = useMultiPdfUpload(TOOL_ID, resetResults);

  const readyEntries = entries.filter(
    (entry): entry is typeof entry & { validation: Extract<typeof entry.validation, { status: "ready" }> } =>
      entry.validation.status === "ready",
  );
  const hasPendingOrErrored = entries.some((entry) => entry.validation.status !== "ready");
  const canMerge = entries.length >= MIN_MERGE_FILE_COUNT && !hasPendingOrErrored;

  const mergeHasRiskyStructures = readyEntries.some((entry) => hasMergeRiskyStructures(entry.validation.structure));
  const hasDigitalSignatures = readyEntries.some((entry) => entry.validation.structure.hasDigitalSignatureFields);
  const anyUnanalyzed = readyEntries.some((entry) => !entry.validation.structure.analyzedSuccessfully);

  useEffect(() => {
    if (mergeHasRiskyStructures && canMerge && !warningShownRef.current) {
      warningShownRef.current = true;
      track("structural_warning_shown", { tool_id: TOOL_ID });
    }
  }, [mergeHasRiskyStructures, canMerge]);

  const handleMerge = useCallback(async () => {
    if (!canMerge) return;
    if (mergeHasRiskyStructures && !mergeRiskAcknowledged) return;
    const buffers = readyEntries.map((entry) => entry.buffer).filter((buffer): buffer is ArrayBuffer => buffer !== null);
    if (buffers.length !== readyEntries.length) return;

    setMergeRunning(true);
    setMergeError(null);
    setMergeResult(null);
    setMergeProgress({ current: 0, total: readyEntries.length });
    track("processing_start", { tool_id: TOOL_ID });
    const startedAt = Date.now();

    try {
      const { promise, cancel } = requestMerge(
        buffers.map((buffer) => buffer.slice(0)),
        (progress) => {
          if (progress.stage === "merging") {
            setMergeProgress({ current: progress.filesProcessed, total: progress.totalFiles });
          }
        },
      );
      mergeCancelRef.current = cancel;
      const response = await promise;
      setMergeResult({
        fileCount: response.fileCount,
        totalPages: response.totalPages,
        bytes: new Uint8Array(response.bytes),
      });

      const durationBucket = durationMsToBucket(Date.now() - startedAt);
      track("processing_success", {
        tool_id: TOOL_ID,
        outcome: "success",
        parts_bucket: partsCountToBucket(response.fileCount),
        duration_bucket: durationBucket,
      });
    } catch (error) {
      const appError = error instanceof PdfAppError ? error : new PdfAppError("unknown", "Erro desconhecido ao juntar.");
      setMergeError(messageFor(appError.code));
      track("processing_error", {
        tool_id: TOOL_ID,
        outcome: "error",
        error_category: appError.code,
        duration_bucket: durationMsToBucket(Date.now() - startedAt),
      });
    } finally {
      setMergeRunning(false);
      setMergeProgress(null);
      mergeCancelRef.current = null;
    }
  }, [canMerge, mergeHasRiskyStructures, mergeRiskAcknowledged, readyEntries]);

  const handleDownload = useCallback(() => {
    if (!mergeResult) return;
    downloadBytes(mergeResult.bytes, mergedFileName());
    track("download_result", { tool_id: TOOL_ID, outcome: "success" });
  }, [mergeResult]);

  const handleReset = useCallback(() => {
    clearAll();
    resetResults();
  }, [clearAll, resetResults]);

  const structuralReasons = [
    readyEntries.some((entry) => entry.validation.structure.hasAcroForm) ? "formulário (AcroForm)" : null,
    readyEntries.some((entry) => entry.validation.structure.hasOutlines) ? "marcadores/outline" : null,
    readyEntries.some((entry) => entry.validation.structure.hasNamedDestinations) ? "destinos nomeados" : null,
    readyEntries.some((entry) => entry.validation.structure.pagesWithWidgetAnnotations > 0)
      ? "campos de formulário em página"
      : null,
    readyEntries.some((entry) => entry.validation.structure.hasDocumentMetadataStream)
      ? "metadados do documento"
      : null,
    readyEntries.some((entry) => entry.validation.structure.pagesWithLinkAnnotations > 0)
      ? "links presentes nas páginas"
      : null,
  ].filter((reason): reason is string => reason !== null);

  return (
    <ToolPageLayout
      title="Juntar PDFs"
      description="Combine dois ou mais PDFs em um único documento, na ordem que você definir."
      crossLink={{ label: "Compactar PDF", to: "/compactar-pdf" }}
      crossLinkCtaId="cross_link_compactar"
    >
      <UploadZone
        multiple
        onFilesSelected={addFiles}
        title="Arraste dois ou mais PDFs aqui ou clique para selecionar"
        hint="Você pode adicionar mais arquivos depois · processado no seu dispositivo, nunca enviado a servidores"
      />

      {notice && (
        <p className="notice notice--warning" role="status">
          {notice}
        </p>
      )}

      {entries.length > 0 && (
        <section className="tools" aria-label="Juntar PDFs">
          <MergeFileList entries={entries} onRemove={removeFile} onMoveUp={(id) => moveEntry(id, "up")} onMoveDown={(id) => moveEntry(id, "down")} disabled={mergeRunning} />

          {entries.length > 0 && (
            <button type="button" className="button button--ghost" onClick={handleReset} disabled={mergeRunning}>
              Limpar seleção
            </button>
          )}

          {entries.length === 1 && (
            <p className="notice notice--info" role="status">
              Selecione pelo menos mais um PDF — a junção precisa de dois ou mais arquivos.
            </p>
          )}

          {hasDigitalSignatures && (
            <p className="notice notice--warning">
              Um ou mais PDFs selecionados contêm um campo de assinatura digital. A <strong>aparência</strong> da
              assinatura pode permanecer no arquivo processado, mas qualquer reserialização ou
              junção <strong>invalida sua validade criptográfica</strong> — como acontece em qualquer
              ferramenta que reescreve um PDF.
            </p>
          )}

          {mergeHasRiskyStructures && (
            <div className="notice notice--warning split-risk-notice">
              <p>
                Um ou mais PDFs selecionados possuem estruturas de nível de documento (
                {anyUnanalyzed
                  ? "não foi possível analisar completamente a estrutura de um ou mais arquivos"
                  : structuralReasons.join(", ")}
                ) que <strong>o PDF resultante da junção, sendo um documento novo, pode não preservar</strong>.
                Links externos simples podem permanecer, mas links internos e destinos entre páginas não são
                garantidos. O registro de cada formulário, marcadores/destinos e os metadados de cada documento
                original não são recriados no arquivo final. O resultado não é equivalente aos documentos originais.
              </p>
              <label className="split-risk-notice__confirm">
                <input
                  type="checkbox"
                  checked={mergeRiskAcknowledged}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setMergeRiskAcknowledged(checked);
                    if (checked) track("structural_warning_confirmed", { tool_id: TOOL_ID });
                  }}
                />
                Entendo o risco e quero continuar mesmo assim
              </label>
            </div>
          )}

          <MergePanel
            disabled={!canMerge || (mergeHasRiskyStructures && !mergeRiskAcknowledged)}
            running={mergeRunning}
            fileCount={entries.length}
            onMerge={handleMerge}
          />
          {mergeRunning && (
            <ProgressBar
              label="Juntando arquivos…"
              current={mergeProgress?.current ?? 0}
              total={mergeProgress?.total ?? 0}
              onCancel={() => mergeCancelRef.current?.()}
            />
          )}
          {mergeError && (
            <p className="notice notice--error" role="alert">
              {mergeError}
            </p>
          )}
          {mergeResult && <MergeResultView result={mergeResult} onDownload={handleDownload} onReset={handleReset} />}
        </section>
      )}
    </ToolPageLayout>
  );
}
