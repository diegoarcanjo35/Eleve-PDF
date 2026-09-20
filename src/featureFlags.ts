/**
 * Feature flag da Eleve IA no frontend (Sprint 01H) — só controla
 * visibilidade de UI (CTA/promoção na Home, disponibilização da rota
 * `/conversar-com-pdf`). NÃO é uma barreira de segurança: quem realmente
 * recusa a funcionalidade é o backend
 * (`functions/_shared/featureFlags.ts`, binding `ELEVE_IA_ENABLED`) — toda
 * chamada a `/api/intelligence/*` é recusada lá independentemente do que
 * esta constante disser aqui.
 *
 * Lida de `import.meta.env.VITE_ELEVE_IA_ENABLED`, injetada pelo Vite a
 * partir da variável de ambiente de MESMO NOME presente no processo de
 * build — a mesma env var que `scripts/generateSeoHtml.ts` lê via
 * `process.env` (esse script roda em Node puro, fora do pipeline do Vite).
 * Uma única fonte, duas formas de leitura conforme o runtime — nunca duas
 * fontes de verdade divergentes.
 *
 * Fail-closed: ausente ou diferente de "true" = desligada. Nunca hardcode
 * `true` aqui.
 */
export const ELEVE_IA_ENABLED = import.meta.env.VITE_ELEVE_IA_ENABLED === "true";
