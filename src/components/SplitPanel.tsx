import { useId, useMemo, useState } from "react";
import { bytesFromUnit } from "@/lib/format";
import { MAX_SPLIT_SIZE_BYTES, MIN_SPLIT_SIZE_BYTES, QUICK_SPLIT_PRESETS_MB } from "@/lib/limits";

interface SplitPanelProps {
  disabled: boolean;
  running: boolean;
  onSplit: (maxBytes: number) => void;
}

export function SplitPanel({ disabled, running, onSplit }: SplitPanelProps) {
  const inputId = useId();
  const [selectedPreset, setSelectedPreset] = useState<number | "custom">(QUICK_SPLIT_PRESETS_MB[1]);
  const [customValue, setCustomValue] = useState("5");
  const [customUnit, setCustomUnit] = useState<"KB" | "MB">("MB");

  const maxBytes = useMemo(() => {
    if (selectedPreset !== "custom") return selectedPreset * 1024 * 1024;
    const numeric = Number(customValue.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return bytesFromUnit(numeric, customUnit);
  }, [selectedPreset, customValue, customUnit]);

  const isValid =
    maxBytes !== null && maxBytes >= MIN_SPLIT_SIZE_BYTES && maxBytes <= MAX_SPLIT_SIZE_BYTES;

  return (
    <div className="tool-panel">
      <fieldset className="split-picker" disabled={disabled || running}>
        <legend>Tamanho máximo por parte</legend>
        <div className="split-picker__presets" role="radiogroup" aria-label="Presets de tamanho">
          {QUICK_SPLIT_PRESETS_MB.map((mb) => (
            <button
              key={mb}
              type="button"
              role="radio"
              aria-checked={selectedPreset === mb}
              className={`chip${selectedPreset === mb ? " chip--selected" : ""}`}
              onClick={() => setSelectedPreset(mb)}
            >
              {mb} MB
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={selectedPreset === "custom"}
            className={`chip${selectedPreset === "custom" ? " chip--selected" : ""}`}
            onClick={() => setSelectedPreset("custom")}
          >
            Personalizado
          </button>
        </div>

        {selectedPreset === "custom" && (
          <div className="split-picker__custom">
            <label htmlFor={inputId}>Tamanho máximo</label>
            <div className="split-picker__custom-row">
              <input
                id={inputId}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={customValue}
                onChange={(event) => setCustomValue(event.target.value)}
                aria-invalid={!isValid}
              />
              <div className="segmented" role="radiogroup" aria-label="Unidade">
                {(["KB", "MB"] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    role="radio"
                    aria-checked={customUnit === unit}
                    className={`segmented__option${customUnit === unit ? " segmented__option--selected" : ""}`}
                    onClick={() => setCustomUnit(unit)}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>
            {!isValid && (
              <p className="field-error" role="alert">
                Informe um tamanho entre {Math.round(MIN_SPLIT_SIZE_BYTES / 1024)} KB e 2 GB.
              </p>
            )}
          </div>
        )}
      </fieldset>

      <button
        type="button"
        className="button button--primary tool-panel__submit"
        disabled={disabled || running || !isValid || maxBytes === null}
        onClick={() => maxBytes !== null && onSplit(maxBytes)}
      >
        {running ? "Dividindo…" : "Dividir PDF"}
      </button>
    </div>
  );
}
