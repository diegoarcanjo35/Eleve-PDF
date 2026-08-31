/**
 * Metadados dos níveis de compactação — módulo leve, sem dependência de `pdf-lib`,
 * para que componentes de UI não puxem a lógica pesada de manipulação de PDF
 * (que deve viver só no bundle do Web Worker) para o thread principal.
 */
export type CompressionLevel = "leve" | "equilibrada" | "maxima";

export interface CompressionLevelInfo {
  id: CompressionLevel;
  label: string;
  description: string;
  lossless: boolean;
}

export const COMPRESSION_LEVELS: CompressionLevelInfo[] = [
  {
    id: "leve",
    label: "Leve",
    description:
      "Otimização estrutural sem perda: reorganiza o PDF em object streams e remove overhead. Não recomprime imagens.",
    lossless: true,
  },
  {
    id: "equilibrada",
    label: "Equilibrada",
    description:
      "Recomprime imagens JPEG embutidas com qualidade alta, mantendo o texto pesquisável e a resolução original.",
    lossless: false,
  },
  {
    id: "maxima",
    label: "Máxima",
    description:
      "Recomprime imagens JPEG com qualidade reduzida e diminui a resolução delas. Pode causar perda visual perceptível nas imagens — o texto continua pesquisável.",
    lossless: false,
  },
];
