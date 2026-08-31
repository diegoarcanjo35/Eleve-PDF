/** Formatação humana de tamanhos de arquivo. Usa base 1024 (KiB/MiB) rotulada como KB/MB, como o senso comum de usuários. */
export function formatBytes(bytes: number, fractionDigits = 2): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${units[exponent]}`;
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function bytesFromUnit(value: number, unit: "KB" | "MB"): number {
  return unit === "KB" ? Math.round(value * 1024) : Math.round(value * 1024 * 1024);
}

export function reductionStats(originalBytes: number, finalBytes: number) {
  const reducedBytes = Math.max(0, originalBytes - finalBytes);
  const reducedPercent = originalBytes > 0 ? (reducedBytes / originalBytes) * 100 : 0;
  return { reducedBytes, reducedPercent };
}

/** Considera "sem redução significativa" abaixo desse limiar, para nunca prometer o que não entregou. */
export const INSIGNIFICANT_REDUCTION_THRESHOLD_PERCENT = 3;

export function isReductionSignificant(reducedPercent: number): boolean {
  return reducedPercent >= INSIGNIFICANT_REDUCTION_THRESHOLD_PERCENT;
}
