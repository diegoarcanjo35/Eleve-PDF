import { formatBytes } from "@/lib/format";
import type { MergeFileEntry } from "@/hooks/useMultiPdfUpload";

interface MergeFileListProps {
  entries: MergeFileEntry[];
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  disabled?: boolean;
}

export function MergeFileList({ entries, onRemove, onMoveUp, onMoveDown, disabled }: MergeFileListProps) {
  return (
    <ol className="merge-file-list" aria-label="Arquivos selecionados, na ordem em que serão juntados">
      {entries.map((entry, index) => {
        const { validation } = entry;
        const pageCount = validation.status === "ready" ? validation.pageCount : null;

        return (
          <li key={entry.id} className="merge-file-list__item file-card">
            <span className="merge-file-list__index" aria-hidden="true">
              {index + 1}
            </span>
            <div className="file-card__info">
              <p className="file-card__name" title={entry.file.name}>
                {entry.file.name}
              </p>
              <p className="file-card__meta">
                {formatBytes(entry.file.size)}
                {pageCount !== null ? ` · ${pageCount} página${pageCount === 1 ? "" : "s"}` : ""}
              </p>
              {validation.status === "validating" && (
                <p className="file-card__status file-card__status--pending">Validando arquivo…</p>
              )}
              {validation.status === "error" && (
                <p className="file-card__status file-card__status--error" role="alert">
                  {validation.message}
                </p>
              )}
              {validation.status === "ready" && (
                <p className="file-card__status file-card__status--ok">Pronto</p>
              )}
            </div>
            <div className="merge-file-list__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => onMoveUp(entry.id)}
                disabled={disabled || index === 0}
                aria-label={`Mover ${entry.file.name} para cima na ordem`}
              >
                ↑
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => onMoveDown(entry.id)}
                disabled={disabled || index === entries.length - 1}
                aria-label={`Mover ${entry.file.name} para baixo na ordem`}
              >
                ↓
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => onRemove(entry.id)}
                disabled={disabled}
                aria-label={`Remover ${entry.file.name} da seleção`}
              >
                Remover
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
