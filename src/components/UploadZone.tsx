import { useCallback, useId, useRef, useState } from "react";

interface UploadZoneProps {
  /** Modo de arquivo único (Compactar/Dividir) — ignorado quando `multiple` é true. */
  onFileSelected?: (file: File) => void;
  /** Modo de múltiplos arquivos (Juntar PDFs). */
  onFilesSelected?: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
  hint?: string;
}

const DEFAULT_TITLE = "Arraste um PDF aqui ou clique para selecionar";
const DEFAULT_HINT = "Apenas arquivos .pdf · processado no seu dispositivo, nunca enviado a servidores";

export function UploadZone({
  onFileSelected,
  onFilesSelected,
  multiple = false,
  disabled,
  title,
  hint,
}: UploadZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const openPicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const dispatchFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      if (multiple) {
        onFilesSelected?.(Array.from(fileList));
      } else {
        const file = fileList[0];
        if (file) onFileSelected?.(file);
      }
    },
    [multiple, onFileSelected, onFilesSelected],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      if (disabled) return;
      dispatchFiles(event.dataTransfer.files);
    },
    [disabled, dispatchFiles],
  );

  return (
    <div
      className={`upload-zone${isDragActive ? " upload-zone--active" : ""}${
        disabled ? " upload-zone--disabled" : ""
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
      onClick={openPicker}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-describedby={`${inputId}-hint`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      }}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        className="upload-zone__input"
        disabled={disabled}
        onChange={(event) => {
          dispatchFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="upload-zone__icon" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="upload-zone__title">{title ?? DEFAULT_TITLE}</p>
      <p className="upload-zone__hint" id={`${inputId}-hint`}>
        {hint ?? DEFAULT_HINT}
      </p>
      <span className="button button--primary upload-zone__button">Selecionar arquivo</span>
    </div>
  );
}
