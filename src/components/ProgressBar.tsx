interface ProgressBarProps {
  label: string;
  current: number;
  total: number;
  onCancel?: () => void;
}

export function ProgressBar({ label, current, total, onCancel }: ProgressBarProps) {
  const determinate = total > 0;
  const percent = determinate ? Math.min(100, Math.round((current / total) * 100)) : null;

  return (
    <div className="progress" aria-live="polite">
      <div className="progress__header">
        <span>{label}</span>
        {onCancel && (
          <button type="button" className="button button--ghost progress__cancel" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={determinate ? `${percent}%` : "Processando"}
      >
        <div
          className={`progress__fill${determinate ? "" : " progress__fill--indeterminate"}`}
          style={determinate ? { width: `${percent}%` } : undefined}
        />
      </div>
      {determinate && (
        <span className="progress__count">
          {current} de {total}
        </span>
      )}
    </div>
  );
}
