import { formatBytes, formatPercent, isReductionSignificant, reductionStats } from "@/lib/format";
import type { CompressionLevel } from "@/lib/compressionLevels";

export interface CompressResultData {
  level: CompressionLevel;
  originalBytes: number;
  finalBytes: number;
  imagesFound: number;
  imagesRecompressed: number;
  usedImageRecompression: boolean;
  fileName: string;
}

interface CompressResultViewProps {
  result: CompressResultData;
  onDownload: () => void;
}

export function CompressResultView({ result, onDownload }: CompressResultViewProps) {
  const { reducedBytes, reducedPercent } = reductionStats(result.originalBytes, result.finalBytes);
  const significant = isReductionSignificant(reducedPercent);

  return (
    <div className="result-card" role="status">
      <h3>Compactação concluída</h3>
      <dl className="result-stats">
        <div>
          <dt>Tamanho original</dt>
          <dd>{formatBytes(result.originalBytes)}</dd>
        </div>
        <div>
          <dt>Tamanho final</dt>
          <dd>{formatBytes(result.finalBytes)}</dd>
        </div>
        <div>
          <dt>Redução</dt>
          <dd>
            {formatBytes(reducedBytes)} ({formatPercent(reducedPercent)})
          </dd>
        </div>
        {result.usedImageRecompression && (
          <div>
            <dt>Imagens recomprimidas</dt>
            <dd>
              {result.imagesRecompressed} de {result.imagesFound}
            </dd>
          </div>
        )}
      </dl>

      {!significant && (
        <p className="notice notice--warning">
          Este PDF já estava bem otimizado: não houve redução significativa de tamanho neste
          nível. Isso é esperado para documentos majoritariamente de texto vetorial ou sem
          imagens recomprimíveis.
        </p>
      )}

      <button type="button" className="button button--primary" onClick={onDownload}>
        Baixar PDF compactado
      </button>
    </div>
  );
}
