import { formatBytes, formatPercent, reductionStats } from "@/lib/format";
import type { CompressionLevel } from "@/lib/compressionLevels";
import type { CompressOutcome } from "@/lib/pdfCompress";

export interface CompressResultData {
  level: CompressionLevel;
  outcome: CompressOutcome;
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
  const reduced = result.outcome === "reduced";
  const { reducedBytes, reducedPercent } = reductionStats(result.originalBytes, result.finalBytes);

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
            {reduced ? (
              <>
                {formatBytes(reducedBytes)} ({formatPercent(reducedPercent)})
              </>
            ) : (
              "Nenhuma"
            )}
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

      {!reduced && (
        <p className="notice notice--warning">
          Este PDF já estava bem otimizado: o processamento não conseguiu reduzir o tamanho de
          forma real neste nível. O <strong>arquivo original foi mantido</strong>, byte a byte —
          nunca entregamos uma versão igual ou maior disfarçada de compactação.
        </p>
      )}

      <button type="button" className="button button--primary" onClick={onDownload}>
        {reduced ? "Baixar PDF compactado" : "Baixar arquivo original"}
      </button>
    </div>
  );
}
