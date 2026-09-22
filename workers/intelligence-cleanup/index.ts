import { runIntelligenceCleanup, type CleanupEnv } from "../../functions/_shared/intelligenceCleanup";

/**
 * Worker dedicado e mínimo — SÓ existe porque Cloudflare Pages Functions não
 * suporta `scheduled`/cron nativamente (só `onRequest*`, ver auditoria da
 * Sprint 01P). Não serve nenhuma rota HTTP própria; sua única
 * responsabilidade é disparar `runIntelligenceCleanup` na cadência definida
 * em `wrangler.toml` (`[triggers] crons`).
 *
 * NUNCA DEPLOYADO NESTA SPRINT — preparado para um gate posterior, junto com
 * a aplicação das migrations 0004-0006 em produção (sem elas, as tabelas que
 * este cleanup lê/escreve não existem em produção ainda).
 *
 * Reaproveita os MESMOS bindings D1/Vectorize do projeto Pages principal
 * (mesmos IDs em `wrangler.toml`) — nenhuma infraestrutura nova, nenhum
 * dado duplicado.
 */
export default {
  async scheduled(_event: ScheduledEvent, env: CleanupEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runIntelligenceCleanup(env).then((result) => {
        // Log estrutural, sem conteúdo sensível (nunca texto/pergunta/
        // resposta/capability) — mesmo padrão de minimização de
        // `intelligenceTelemetry.ts`.
        console.log(
          JSON.stringify({
            type: "intelligence_cleanup",
            scanned: result.scanned,
            sessionsDeleted: result.sessions.filter((s) => s.sessionDeleted).length,
            sessionsFailed: result.sessions.filter((s) => s.failed).length,
            chunksDeleted: result.sessions.reduce((sum, s) => sum + s.chunksDeleted, 0),
            vectorsDeleted: result.sessions.reduce((sum, s) => sum + s.vectorsDeleted, 0),
            rateLimitWindowsDeleted: result.rateLimitWindowsDeleted,
          }),
        );
      }),
    );
  },
};
