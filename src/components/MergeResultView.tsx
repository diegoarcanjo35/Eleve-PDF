export interface MergeResultData {
  fileCount: number;
  totalPages: number;
}

interface MergeResultViewProps {
  result: MergeResultData;
  onDownload: () => void;
  onReset: () => void;
}

export function MergeResultView({ result, onDownload, onReset }: MergeResultViewProps) {
  return (
    <div className="result-card" role="status">
      <h3>União concluída</h3>
      <dl className="result-stats">
        <div>
          <dt>Arquivos juntados</dt>
          <dd>{result.fileCount}</dd>
        </div>
        <div>
          <dt>Total de páginas</dt>
          <dd>{result.totalPages}</dd>
        </div>
      </dl>
      <button type="button" className="button button--primary" onClick={onDownload}>
        Baixar PDF único
      </button>
      <button type="button" className="button button--ghost" onClick={onReset}>
        Juntar outros PDFs
      </button>
    </div>
  );
}
