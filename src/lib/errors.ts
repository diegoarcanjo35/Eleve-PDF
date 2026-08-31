export type PdfErrorCode =
  | "not-a-pdf"
  | "corrupted"
  | "password-protected"
  | "too-large"
  | "too-many-pages"
  | "out-of-memory"
  | "processing-failed"
  | "page-exceeds-limit"
  | "unknown";

export class PdfAppError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = "PdfAppError";
    this.code = code;
  }
}

export const ERROR_MESSAGES: Record<PdfErrorCode, string> = {
  "not-a-pdf": "Este arquivo não é um PDF válido. Selecione um arquivo com extensão e conteúdo .pdf.",
  corrupted: "Não foi possível ler este PDF — o arquivo parece estar corrompido ou incompleto.",
  "password-protected": "Este PDF está protegido por senha. Remova a senha antes de enviá-lo.",
  "too-large": "Este arquivo excede o limite de tamanho suportado pelo navegador.",
  "too-many-pages": "Este PDF excede o número máximo de páginas suportado nesta versão.",
  "out-of-memory": "O navegador ficou sem memória disponível para concluir esta operação.",
  "processing-failed": "Ocorreu uma falha durante o processamento. Tente novamente.",
  "page-exceeds-limit":
    "Uma das páginas, sozinha, é maior que o limite escolhido e não pode ser dividida.",
  unknown: "Ocorreu um erro inesperado.",
};

export function messageFor(code: PdfErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown;
}
