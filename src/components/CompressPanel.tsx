import { useState } from "react";
import { COMPRESSION_LEVELS, type CompressionLevel } from "@/lib/compressionLevels";

interface CompressPanelProps {
  disabled: boolean;
  running: boolean;
  onCompress: (level: CompressionLevel) => void;
}

export function CompressPanel({ disabled, running, onCompress }: CompressPanelProps) {
  const [level, setLevel] = useState<CompressionLevel>("equilibrada");
  const selected = COMPRESSION_LEVELS.find((item) => item.id === level)!;

  return (
    <div className="tool-panel">
      <fieldset className="level-picker" disabled={disabled || running}>
        <legend>Nível de compactação</legend>
        <div className="level-picker__options">
          {COMPRESSION_LEVELS.map((item) => (
            <label
              key={item.id}
              className={`level-card${level === item.id ? " level-card--selected" : ""}`}
            >
              <input
                type="radio"
                name="compression-level"
                value={item.id}
                checked={level === item.id}
                onChange={() => setLevel(item.id)}
              />
              <span className="level-card__title">
                {item.label}
                {item.lossless && <span className="badge badge--lossless">sem perda</span>}
              </span>
              <span className="level-card__description">{item.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {!selected.lossless && (
        <p className="notice notice--info">
          Este nível recomprime imagens JPEG elegíveis{level === "maxima" ? " e reduz a resolução delas" : ""}.
          A ordem das páginas e o texto pesquisável são preservados nos casos testados, mas
          estruturas especiais do PDF (formulários, links, marcadores, metadados, assinaturas)
          não possuem garantia genérica de preservação.
        </p>
      )}

      <button
        type="button"
        className="button button--primary tool-panel__submit"
        disabled={disabled || running}
        onClick={() => onCompress(level)}
      >
        {running ? "Compactando…" : "Compactar PDF"}
      </button>
    </div>
  );
}
