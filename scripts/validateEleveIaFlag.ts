/**
 * Validador de consistência da ativação da Eleve IA (Sprint 01H.1) —
 * primeiro passo de `npm run build` (ver package.json). Falha o build
 * (`process.exitCode = 1`) se `ELEVE_IA_ENABLED` (o que o backend vai
 * enxergar, via wrangler.toml/secret) e `VITE_ELEVE_IA_ENABLED` (o que o
 * Vite vai embutir no bundle do frontend) representarem estados
 * diferentes — nunca uma ligada e a outra desligada.
 *
 * Regra pura em `scripts/eleveIaFlagConsistency.ts`, testada à parte. Não
 * imprime os valores brutos das variáveis, só o estado ligada/desligada de
 * cada lado (nenhuma delas é um secret, mas mesmo assim evitamos ecoar
 * texto arbitrário do ambiente).
 *
 * Uso: `npx tsx scripts/validateEleveIaFlag.ts`.
 */
import { checkEleveIaFlagConsistency } from "./eleveIaFlagConsistency";

function main() {
  const result = checkEleveIaFlagConsistency(process.env.ELEVE_IA_ENABLED, process.env.VITE_ELEVE_IA_ENABLED);

  if (!result.consistent) {
    console.error(`✗ ${result.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✓ Configuração da Eleve IA consistente (${result.state}).`);
}

main();
