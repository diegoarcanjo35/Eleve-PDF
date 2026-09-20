/**
 * Feature flag da Eleve IA no backend (Sprint 01H) — esta é a barreira de
 * segurança real, nunca o `src/featureFlags.ts` do frontend (que só
 * controla visibilidade de UI: CTA da Home, promoção, disponibilização da
 * rota `/conversar-com-pdf`). Mesmo que o frontend fosse enganado a mostrar
 * a UI da Eleve IA, todo endpoint de `/api/intelligence/*` chama
 * `isEleveIaEnabled` ANTES de qualquer outra coisa — antes de Origin/Host,
 * sessão, rate limit, D1 de Intelligence, embedding, Vectorize ou Luna — e
 * recusa com 404 se ela retornar `false`. As duas flags (esta e a do
 * frontend) devem ser configuradas juntas na hora do deploy — ver
 * `ELEVE_IA_ENABLED` e `VITE_ELEVE_IA_ENABLED` no `wrangler.toml`. Uma
 * divergência entre elas só causa inconsistência de UI (ex.: CTA visível
 * com a API recusando), nunca um vazamento de funcionalidade, porque esta
 * função é sempre a fonte de verdade para acesso real.
 *
 * Fail-closed: ausente ou diferente de "true" = desligada. Nunca hardcode
 * `true` aqui — o valor sempre vem do binding de ambiente.
 */
export interface EleveIaFlagEnv {
  ELEVE_IA_ENABLED?: string;
}

export function isEleveIaEnabled(env: EleveIaFlagEnv): boolean {
  return env.ELEVE_IA_ENABLED === "true";
}
