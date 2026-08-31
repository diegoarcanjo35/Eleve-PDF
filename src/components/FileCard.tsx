import { formatBytes } from "@/lib/format";

interface FileCardProps {
  fileName: string;
  sizeBytes: number;
  pageCount: number | null;
  status: "validating" | "ready" | "error";
  errorMessage?: string;
  onRemove: () => void;
}

export function FileCard({
  fileName,
  sizeBytes,
  pageCount,
  status,
  errorMessage,
  onRemove,
}: FileCardProps) {
  return (
    <div className="file-card" role="status">
      <div className="file-card__icon" aria-hidden="true">
        PDF
      </div>
      <div className="file-card__info">
        <p className="file-card__name" title={fileName}>
          {fileName}
        </p>
        <p className="file-card__meta">
          {formatBytes(sizeBytes)}
          {pageCount !== null ? ` · ${pageCount} página${pageCount === 1 ? "" : "s"}` : ""}
        </p>
        {status === "validating" && (
          <p className="file-card__status file-card__status--pending">Validando arquivo…</p>
        )}
        {status === "error" && (
          <p className="file-card__status file-card__status--error" role="alert">
            {errorMessage}
          </p>
        )}
        {status === "ready" && (
          <p className="file-card__status file-card__status--ok">Pronto para processar</p>
        )}
      </div>
      <button
        type="button"
        className="button button--ghost file-card__remove"
        onClick={onRemove}
        aria-label={`Remover ${fileName} e escolher outro arquivo`}
      >
        Remover
      </button>
    </div>
  );
}
