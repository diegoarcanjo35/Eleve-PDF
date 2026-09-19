/** Rotas cujo fluxo processa o arquivo inteiramente no navegador — "Processamento
 * local" continua verdadeiro para elas. Qualquer outra rota (hoje, só
 * `/conversar-com-pdf`, Fase 01) usa uma comunicação própria, porque o texto
 * necessário do documento é processado pela camada de Inteligência, não só
 * localmente — ver `ConversarComPdfPage.tsx`. Nunca a mesma afirmação para os
 * dois fluxos (Sprint 01F.1). */
const HYBRID_PROCESSING_ROUTES = new Set(["/conversar-com-pdf"]);

export function privacyBadgeLabel(pathname: string): string {
  return HYBRID_PROCESSING_ROUTES.has(pathname) ? "Processamento seguro com Eleve IA" : "Processamento local";
}
