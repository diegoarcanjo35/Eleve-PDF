import { useCallback, useRef, useState } from "react";
import { requestValidate } from "@/lib/pdfWorkerClient";
import { PdfAppError, messageFor } from "@/lib/errors";
import type { StructuralFindings } from "@/lib/structuralFindings";

export type ValidationState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "ready"; pageCount: number; structure: StructuralFindings }
  | { status: "error"; message: string };

/**
 * Upload + validação de arquivo, reutilizado pelas páginas de Compactar e
 * Dividir. Extraído do fluxo original (mesmo comportamento, incluindo a
 * proteção contra corrida de validação): cada seleção/remoção incrementa um
 * token de operação, e uma resposta assíncrona só atualiza o estado se ainda
 * for a mais recente.
 */
export function usePdfUpload(onBeforeSelect?: () => void) {
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationState>({ status: "idle" });
  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const fileTokenRef = useRef(0);

  const handleFileSelected = useCallback(
    async (selected: File) => {
      const myToken = ++fileTokenRef.current;
      onBeforeSelect?.();
      setFile(selected);
      setValidation({ status: "validating" });
      try {
        const buffer = await selected.arrayBuffer();
        if (fileTokenRef.current !== myToken) return;
        const { promise } = requestValidate(buffer.slice(0), selected.size);
        const result = await promise;
        if (fileTokenRef.current !== myToken) return;
        fileBufferRef.current = buffer;
        setValidation({ status: "ready", pageCount: result.pageCount, structure: result.structure });
      } catch (error) {
        if (fileTokenRef.current !== myToken) return;
        const appError =
          error instanceof PdfAppError
            ? error
            : new PdfAppError("unknown", "Erro desconhecido ao validar o arquivo.");
        setValidation({ status: "error", message: messageFor(appError.code) });
      }
    },
    [onBeforeSelect],
  );

  const handleRemove = useCallback(() => {
    fileTokenRef.current += 1;
    setFile(null);
    fileBufferRef.current = null;
    setValidation({ status: "idle" });
    onBeforeSelect?.();
  }, [onBeforeSelect]);

  return { file, validation, fileBufferRef, handleFileSelected, handleRemove };
}
