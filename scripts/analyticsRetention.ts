/**
 * Estratégia de retenção dos eventos analíticos brutos — 90 dias.
 *
 * Este módulo é intencionalmente "burro": só a query e uma função pura para
 * calcular o corte de data. A execução real (contra o D1 de produção) fica
 * de fora desta fase — ver RELATORIO-FASE-E-ANALYTICS.md, seção "Retenção".
 * O teste local (`scripts/__tests__/analyticsRetention.test.ts`) roda esta
 * mesma query contra um SQLite em memória, nunca contra um banco real.
 */

export const RETENTION_DAYS = 90;

/** Statement de limpeza — remove eventos brutos mais antigos que o corte.
 * Preparado (placeholder `?1`), nunca concatena a data diretamente. */
export const RETENTION_DELETE_SQL = "DELETE FROM analytics_events WHERE occurred_at < ?1";

export function retentionCutoffIso(now: Date = new Date()): string {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

/**
 * Como a limpeza será executada em produção (documentado, não implementado
 * nesta fase): um Cloudflare Cron Trigger (Worker agendado, ex.: diário às
 * 04:00 UTC) chamando `env.DB.prepare(RETENTION_DELETE_SQL).bind(retentionCutoffIso()).run()`.
 * Não há exclusão destrutiva automática configurada nesta entrega — precisa
 * ser adicionada explicitamente (um novo Worker agendado ou uma rota interna
 * chamada pelo Cron) quando o Diego autorizar essa parte em produção.
 *
 * Agregações que poderão ser preservadas no futuro, mesmo depois da limpeza
 * dos eventos brutos: totais diários por `event_type` (e por `tool_id`
 * quando aplicável) — o mesmo formato já devolvido por
 * `daily_evolution`/`tool_usage` em `functions/api/analytics/summary.ts`,
 * gravados numa tabela de resumo agregado antes de apagar os brutos
 * correspondentes, se essa necessidade aparecer.
 */
