/**
 * Erro tipado para respostas HTTP não-ok dos endpoints de Intelligence
 * (`/sessions`, `/ingest`, `/ask`). Carrega só o status HTTP — os
 * endpoints de erro do backend devolvem corpo vazio por design (ver
 * `functions/api/intelligence/**`), então nunca há detalhe de provider,
 * banco ou stack para vazar aqui. Usado só para permitir que a UI escolha
 * uma mensagem amigável específica (sessão expirada, limite de uso,
 * indisponibilidade) em vez de sempre mostrar o mesmo texto genérico.
 */
export class IntelligenceHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "IntelligenceHttpError";
    this.status = status;
  }
}

export type IntelligenceErrorContext = "preparing" | "asking";

/**
 * Mensagem amigável por status HTTP — nunca menciona provider, banco,
 * stack ou qualquer termo técnico de infraestrutura. `context` ajusta só a
 * mensagem padrão (fallback), já que "preparar o documento" e "responder à
 * pergunta" são momentos diferentes da experiência.
 */
export function friendlyIntelligenceErrorMessage(
  status: number | undefined,
  context: IntelligenceErrorContext,
): string {
  switch (status) {
    case 410:
      return context === "asking"
        ? 'Sua sessão de conversa expirou. Use "Trocar documento" para selecionar o PDF novamente.'
        : "Esta sessão temporária expirou antes de concluir. Selecione o PDF novamente.";
    case 429:
      return "Muitas solicitações em um curto período. Aguarde alguns instantes e tente novamente.";
    case 502:
    case 503:
      return "O serviço de IA está temporariamente indisponível. Tente novamente em instantes.";
    default:
      return context === "asking"
        ? "Não foi possível obter uma resposta agora. Tente novamente."
        : "Não foi possível preparar este documento. Tente novamente.";
  }
}
