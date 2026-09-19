import { useCallback, useRef, useState } from "react";
import { requestExtractText, requestValidate } from "@/lib/pdfWorkerClient";
import { ingestExtractedDocument } from "@/lib/intelligenceIngestClient";
import { askQuestion, type AskResult } from "@/lib/intelligenceAskClient";
import { PdfAppError, messageFor } from "@/lib/errors";
import { track } from "@/analytics/client";
import type { ExtractedDocument, ExtractProgress } from "@/lib/pdfExtractText";

const TOOL_ID = "conversar-com-pdf" as const;

export type IntelligenceStage =
  | "idle"
  | "validating"
  | "extracting"
  | "unsupported"
  | "preparing"
  | "ready"
  | "error";

export interface IntelligenceExtractProgress {
  current: number;
  total: number;
}

interface UseIntelligenceSessionResult {
  stage: IntelligenceStage;
  errorMessage: string | null;
  file: File | null;
  pageCount: number | null;
  /** Bytes originais do PDF, intactos (nunca transferidos ao worker) — só
   * para o visualizador local (Sprint 01F). Nunca enviados ao backend. */
  viewerBytes: ArrayBuffer | null;
  extractProgress: IntelligenceExtractProgress | null;
  handleFileSelected: (file: File) => void;
  reset: () => void;
  /**
   * Pergunta à Eleve IA usando a sessão corrente. Lança um erro controlado
   * local se a sessão não estiver pronta ou se a capability tiver sido
   * perdida (reload/nova montagem) — NUNCA tenta prosseguir só com o
   * `sessionId` (ver `functions/_shared/sessionCapability.ts`).
   */
  ask: (question: string) => Promise<AskResult>;
}

function toFriendlyError(error: unknown): string {
  if (error instanceof PdfAppError) return messageFor(error.code);
  return "Não foi possível preparar este documento. Tente novamente.";
}

/**
 * Orquestra o fluxo completo do "Converse com PDF" (Sprint 01F): validar
 * localmente -> extrair texto localmente -> criar sessão Intelligence ->
 * ingest -> pronto para conversar. O PDF original nunca sai do navegador —
 * só o texto estruturado necessário segue para o backend (ver
 * `intelligenceIngestClient.ts`).
 *
 * SESSION CAPABILITY (decisão desta sprint): mantida SOMENTE em memória,
 * num `useRef` que nunca é exposto por este hook — nenhum componente
 * consumidor consegue lê-la, só usá-la indiretamente via `ask()`. Nunca
 * localStorage/sessionStorage/cookie/URL. Um reload ou uma nova montagem
 * deste hook começa sempre com a capability vazia — a sessão anterior fica
 * inacessível, propositalmente (ver relatório Sprint 01F).
 */
export function useIntelligenceSession(): UseIntelligenceSessionResult {
  const [stage, setStage] = useState<IntelligenceStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [viewerBytes, setViewerBytes] = useState<ArrayBuffer | null>(null);
  const [extractProgress, setExtractProgress] = useState<IntelligenceExtractProgress | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const capabilityRef = useRef<string | null>(null);
  const fileTokenRef = useRef(0);

  const reset = useCallback(() => {
    fileTokenRef.current += 1;
    sessionIdRef.current = null;
    capabilityRef.current = null;
    setStage("idle");
    setErrorMessage(null);
    setFile(null);
    setPageCount(null);
    setViewerBytes(null);
    setExtractProgress(null);
  }, []);

  const handleFileSelected = useCallback((selected: File) => {
    const myToken = ++fileTokenRef.current;
    sessionIdRef.current = null;
    capabilityRef.current = null;
    setFile(selected);
    setPageCount(null);
    setViewerBytes(null);
    setExtractProgress(null);
    setErrorMessage(null);
    setStage("validating");
    track("intel_upload_started", { tool_id: TOOL_ID });

    void (async () => {
      const isCurrent = () => fileTokenRef.current === myToken;
      try {
        const buffer = await selected.arrayBuffer();
        if (!isCurrent()) return;

        const { promise: validatePromise } = requestValidate(buffer.slice(0), selected.size);
        const validated = await validatePromise;
        if (!isCurrent()) return;

        setStage("extracting");
        const { promise: extractPromise } = requestExtractText(
          buffer.slice(0),
          (progress: ExtractProgress) => {
            if (!isCurrent()) return;
            setExtractProgress({ current: progress.pagesProcessed, total: progress.totalPages });
          },
        );
        const { document } = await extractPromise;
        if (!isCurrent()) return;
        setExtractProgress(null);

        const extracted: ExtractedDocument = document;
        if (extracted.overallStatus === "unsupported") {
          setPageCount(validated.pageCount);
          setStage("unsupported");
          track("intel_document_unsupported", { tool_id: TOOL_ID });
          return;
        }

        setStage("preparing");
        const result = await ingestExtractedDocument(extracted);
        if (!isCurrent()) return;

        sessionIdRef.current = result.sessionId;
        capabilityRef.current = result.sessionCapability;
        setPageCount(validated.pageCount);
        setViewerBytes(buffer);
        setStage("ready");
        track("intel_document_ready", { tool_id: TOOL_ID });
      } catch (error) {
        if (!isCurrent()) return;
        setStage("error");
        setErrorMessage(toFriendlyError(error));
        track("processing_error", {
          tool_id: TOOL_ID,
          outcome: "error",
          error_category: error instanceof PdfAppError ? error.code : "unknown",
        });
      }
    })();
  }, []);

  const ask = useCallback(async (question: string): Promise<AskResult> => {
    const sessionId = sessionIdRef.current;
    const capability = capabilityRef.current;
    if (!sessionId || !capability) {
      throw new Error("Sessão de conversa indisponível — envie o documento novamente.");
    }
    track("intel_question_sent", { tool_id: TOOL_ID });
    try {
      const result = await askQuestion(sessionId, capability, question);
      track("intel_answer_received", { tool_id: TOOL_ID, outcome: "success" });
      return result;
    } catch (error) {
      track("processing_error", { tool_id: TOOL_ID, outcome: "error", error_category: "unknown" });
      throw error;
    }
  }, []);

  return { stage, errorMessage, file, pageCount, viewerBytes, extractProgress, handleFileSelected, reset, ask };
}
