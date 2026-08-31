import { formatBytes } from "@/lib/format";

export interface SplitPartView {
  index: number;
  fileName: string;
  pageCount: number;
  sizeBytes: number;
  exceedsLimit: boolean;
}

interface SplitResultViewProps {
  parts: SplitPartView[];
  maxBytes: number;
  onDownloadPart: (index: number) => void;
  onDownloadZip: () => void;
  onCompressOversizedPart?: (index: number) => void;
  compressingPartIndex?: number | null;
}

export function SplitResultView({
  parts,
  maxBytes,
  onDownloadPart,
  onDownloadZip,
  onCompressOversizedPart,
  compressingPartIndex,
}: SplitResultViewProps) {
  const hasOversized = parts.some((part) => part.exceedsLimit);

  return (
    <div className="result-card" role="status">
      <h3>
        Divisão concluída — {parts.length} parte{parts.length === 1 ? "" : "s"}
      </h3>

      {hasOversized && (
        <p className="notice notice--warning">
          Uma ou mais páginas, sozinhas, são maiores que o limite de {formatBytes(maxBytes)} e não
          puderam ser divididas — nenhuma página é cortada ao meio. Você pode aumentar o limite ou
          compactar essa página específica (com possível perda visual).
        </p>
      )}

      <ul className="parts-list">
        {parts.map((part) => (
          <li key={part.index} className={`parts-list__item${part.exceedsLimit ? " parts-list__item--warning" : ""}`}>
            <div className="parts-list__info">
              <p className="parts-list__name">{part.fileName}</p>
              <p className="parts-list__meta">
                {part.pageCount} página{part.pageCount === 1 ? "" : "s"} · {formatBytes(part.sizeBytes)}
                {part.exceedsLimit && (
                  <span className="badge badge--warning">acima do limite</span>
                )}
              </p>
            </div>
            <div className="parts-list__actions">
              {part.exceedsLimit && onCompressOversizedPart && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onCompressOversizedPart(part.index)}
                  disabled={compressingPartIndex === part.index}
                >
                  {compressingPartIndex === part.index ? "Compactando…" : "Compactar esta parte"}
                </button>
              )}
              <button
                type="button"
                className="button button--ghost"
                onClick={() => onDownloadPart(part.index)}
              >
                Baixar
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="button button--primary" onClick={onDownloadZip}>
        Baixar todas em ZIP
      </button>
    </div>
  );
}
