interface MergePanelProps {
  disabled: boolean;
  running: boolean;
  fileCount: number;
  onMerge: () => void;
}

export function MergePanel({ disabled, running, fileCount, onMerge }: MergePanelProps) {
  return (
    <div className="tool-panel">
      <button
        type="button"
        className="button button--primary tool-panel__submit"
        disabled={disabled || running}
        onClick={onMerge}
      >
        {running ? "Juntando…" : `Juntar ${fileCount} PDFs`}
      </button>
    </div>
  );
}
