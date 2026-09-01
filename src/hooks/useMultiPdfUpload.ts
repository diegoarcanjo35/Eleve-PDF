import { useCallback, useState } from "react";
import { requestValidate } from "@/lib/pdfWorkerClient";
import { PdfAppError, messageFor } from "@/lib/errors";
import type { StructuralFindings } from "@/lib/structuralFindings";
import { MAX_MERGE_FILE_COUNT } from "@/lib/limits";
import { track } from "@/analytics/client";
import type { ToolId } from "@shared/analytics/events";

export type MergeValidationState =
  | { status: "validating" }
  | { status: "ready"; pageCount: number; structure: StructuralFindings }
  | { status: "error"; message: string };

export interface MergeFileEntry {
  id: string;
  file: File;
  validation: MergeValidationState;
  buffer: ArrayBuffer | null;
  /** Hex do SHA-256 do conteúdo, usado só para detectar duplicação acidental
   * com segurança (nunca enviado a lugar nenhum, nunca persistido). */
  digestHex: string | null;
}

let entryCounter = 0;
function nextEntryId(): string {
  entryCounter += 1;
  return `merge-file-${entryCounter}-${Date.now()}`;
}

/** SHA-256 do conteúdo — comparação exata, não um heurístico por nome/tamanho
 * (dois arquivos diferentes podem coincidir em nome e tamanho). Retorna `null`
 * (nunca lança) se a Web Crypto API não estiver disponível no ambiente — nesse
 * caso a detecção de duplicidade é simplesmente pulada, nunca finge detectar. */
async function safeDigestHex(buffer: ArrayBuffer): Promise<string | null> {
  try {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/**
 * Upload + validação de MÚLTIPLOS arquivos, para a ferramenta Juntar PDFs.
 * Cada arquivo é validado individualmente (reaproveita `requestValidate`, o
 * mesmo usado por `usePdfUpload`), mantendo sua própria ordem na lista — a
 * ordem de `entries` É a ordem de junção.
 */
export function useMultiPdfUpload(toolId: ToolId, onBeforeChange?: () => void) {
  const [entries, setEntries] = useState<MergeFileEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      onBeforeChange?.();
      setNotice(null);

      const knownDigests = new Set(
        entries.map((entry) => entry.digestHex).filter((digest): digest is string => digest !== null),
      );

      const room = MAX_MERGE_FILE_COUNT - entries.length;
      const accepted = files.slice(0, Math.max(0, room));
      if (files.length > accepted.length) {
        setNotice(
          `Só é possível juntar até ${MAX_MERGE_FILE_COUNT} arquivos por vez — ${
            files.length - accepted.length
          } arquivo(s) a mais não foram adicionados.`,
        );
      }

      for (const file of accepted) {
        const id = nextEntryId();
        setEntries((prev) => [
          ...prev,
          { id, file, validation: { status: "validating" }, buffer: null, digestHex: null },
        ]);

        try {
          const buffer = await file.arrayBuffer();
          const digestHex = await safeDigestHex(buffer);

          if (digestHex && knownDigests.has(digestHex)) {
            setEntries((prev) => prev.filter((entry) => entry.id !== id));
            setNotice(
              `"${file.name}" parece ser uma cópia de um arquivo já selecionado e não foi adicionado de novo.`,
            );
            continue;
          }
          if (digestHex) knownDigests.add(digestHex);

          const { promise } = requestValidate(buffer.slice(0), file.size);
          const result = await promise;
          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    buffer,
                    digestHex,
                    validation: { status: "ready", pageCount: result.pageCount, structure: result.structure },
                  }
                : entry,
            ),
          );
          track("file_validation_success", { tool_id: toolId, outcome: "success" });
        } catch (error) {
          const appError =
            error instanceof PdfAppError ? error : new PdfAppError("unknown", "Erro desconhecido ao validar o arquivo.");
          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === id ? { ...entry, validation: { status: "error", message: messageFor(appError.code) } } : entry,
            ),
          );
          track("file_validation_error", { tool_id: toolId, outcome: "error", error_category: appError.code });
        }
      }
    },
    [entries, onBeforeChange, toolId],
  );

  const removeFile = useCallback(
    (id: string) => {
      onBeforeChange?.();
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    },
    [onBeforeChange],
  );

  const clearAll = useCallback(() => {
    onBeforeChange?.();
    setEntries([]);
    setNotice(null);
  }, [onBeforeChange]);

  const moveEntry = useCallback((id: string, direction: "up" | "down") => {
    setEntries((prev) => {
      const index = prev.findIndex((entry) => entry.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved!);
      return next;
    });
  }, []);

  return { entries, notice, addFiles, removeFile, clearAll, moveEntry };
}
