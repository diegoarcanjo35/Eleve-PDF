/**
 * Regra pura de consistência entre as duas flags da Eleve IA (Sprint 01H.1):
 * `ELEVE_IA_ENABLED` (backend, `functions/_shared/featureFlags.ts`) e
 * `VITE_ELEVE_IA_ENABLED` (frontend, `src/featureFlags.ts`). Extraída para
 * ser testável sem I/O nem `process.env` — ver
 * `scripts/__tests__/eleveIaFlagConsistency.test.ts`. O script executável
 * (`scripts/validateEleveIaFlag.ts`) só lê `process.env` e chama esta
 * função.
 *
 * Isto NÃO é uma barreira de segurança nem uma tentativa de compartilhar
 * uma única variável em runtime — Vite (build-time) e Pages Functions
 * (request-time) são processos/momentos diferentes, e cada lado continua
 * lendo sua própria variável exatamente como antes. Esta checagem só existe
 * para transformar uma configuração divergente num erro de build, ANTES do
 * deploy — a barreira real continua sendo `isEleveIaEnabled` no backend.
 */
export interface EleveIaFlagConsistencyResult {
  consistent: boolean;
  state: "desligada" | "ligada" | "inconsistente";
  message?: string;
}

/**
 * Mesma regra fail-closed usada em produção dos dois lados: só a string
 * exata `"true"` liga a flag — qualquer outro valor, incluindo ausência,
 * conta como desligada aqui também, para a checagem refletir exatamente o
 * que o runtime realmente vai interpretar.
 */
export function checkEleveIaFlagConsistency(
  backendValue: string | undefined,
  frontendValue: string | undefined,
): EleveIaFlagConsistencyResult {
  const backendOn = backendValue === "true";
  const frontendOn = frontendValue === "true";

  if (backendOn === frontendOn) {
    return { consistent: true, state: backendOn ? "ligada" : "desligada" };
  }

  return {
    consistent: false,
    state: "inconsistente",
    message:
      'ELEVE_IA_ENABLED e VITE_ELEVE_IA_ENABLED precisam representar o mesmo estado ' +
      `(backend está "${backendOn ? "ligada" : "desligada"}", frontend está "${frontendOn ? "ligada" : "desligada"}"). ` +
      'Configure as duas variáveis de ambiente com o mesmo valor ("true" nas duas, ou nenhuma delas "true") antes de buildar.',
  };
}
