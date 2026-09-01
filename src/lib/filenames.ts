/** Gera nomes sequenciais seguros: `nome-original-parte-01.pdf`, preservando o nome base e evitando caminhos/traversal. */
export function sanitizeBaseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.pdf$/i, "");
  const noPath = withoutExt.split(/[/\\]/).pop() ?? "documento";
  const cleaned = noPath
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned.length > 0 ? cleaned : "documento";
}

export function partFileName(baseName: string, index: number, total: number): string {
  const width = Math.max(2, String(total).length);
  const padded = String(index).padStart(width, "0");
  return `${sanitizeBaseName(baseName)}-parte-${padded}.pdf`;
}

export function compressedFileName(baseName: string): string {
  return `${sanitizeBaseName(baseName)}-compactado.pdf`;
}

/** Nome fixo do PDF resultante da junção — não é derivado dos nomes dos
 * arquivos de origem (podem ser muitos, de nomes muito diferentes). */
export function mergedFileName(): string {
  return "documentos-unidos.pdf";
}
