import { verifyAccessJwt } from "../../_shared/accessAuth";

interface D1QueryResult<T> {
  results: T[];
}

interface SummaryD1 {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>;
    };
  };
}

interface Env {
  DB: SummaryD1;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

// Todas as respostas deste endpoint carregam dados privados (mesmo os erros,
// que confirmam/negam autorização) — nunca podem ser armazenadas em cache
// público (navegador, CDN, proxy intermediário). `no-store` é aplicado em
// TODO retorno desta rota, sucesso ou erro, sem exceção.
const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

function genericError(status: number): Response {
  return new Response(null, { status, headers: { ...PRIVATE_NO_STORE_HEADERS } });
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

/** Só aceita datas ISO simples (YYYY-MM-DD) para os limites do período — nunca
 * repassa a query string bruta para o SQL. */
function parseDateParam(value: string | null, fallback: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return fallback;
}

/**
 * GET /api/analytics/summary — só dados agregados, nunca eventos brutos nem
 * sessões individuais. Protegido por validação real do JWT do Cloudflare
 * Access (ver functions/_shared/accessAuth.ts). Sem CF_ACCESS_TEAM_DOMAIN e
 * CF_ACCESS_AUD configurados, este endpoint está sempre bloqueado (503) —
 * é o estado atual, intencional, enquanto o Access não é configurado em
 * produção (ver relatório, "Proteção obrigatória").
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    return genericError(503);
  }

  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  const claims = await verifyAccessJwt(jwt, {
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    audience: env.CF_ACCESS_AUD,
  });
  if (!claims) {
    return genericError(403);
  }

  const url = new URL(request.url);
  const from = parseDateParam(url.searchParams.get("from"), defaultFrom());
  const to = parseDateParam(url.searchParams.get("to"), defaultTo());

  try {
    const [
      sessions,
      pageViews,
      toolUsage,
      validations,
      processing,
      errorsByCategory,
      downloads,
      noGain,
      oversizedParts,
      byUtmSource,
      byReferrerHost,
      dailyEvolution,
    ] = await Promise.all([
      countDistinctSessions(env.DB, from, to),
      countByEvent(env.DB, "page_view", from, to),
      groupByToolAndEvent(env.DB, from, to),
      countByEventGrouped(env.DB, ["file_validation_success", "file_validation_error"], from, to),
      countByEventGrouped(env.DB, ["processing_start", "processing_success", "processing_error"], from, to),
      groupByErrorCategory(env.DB, from, to),
      countByEvent(env.DB, "download_result", from, to),
      countByEvent(env.DB, "no_gain_original_returned", from, to),
      groupByOversizedBucket(env.DB, from, to),
      groupByField(env.DB, "utm_source", from, to),
      groupByField(env.DB, "referrer_host", from, to),
      dailyEvolutionQuery(env.DB, from, to),
    ]);

    return json({
      period: { from, to },
      sessions,
      page_views: pageViews,
      tool_usage: toolUsage,
      validations,
      processing,
      errors_by_category: errorsByCategory,
      downloads,
      no_gain_returned: noGain,
      oversized_parts: oversizedParts,
      by_utm_source: byUtmSource,
      by_referrer_host: byReferrerHost,
      daily_evolution: dailyEvolution,
    });
  } catch {
    return genericError(500);
  }
};

function defaultFrom(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

async function countDistinctSessions(db: SummaryD1, from: string, to: string): Promise<number> {
  const { results } = await db
    .prepare(`SELECT COUNT(DISTINCT session_id) as n FROM analytics_events WHERE occurred_at BETWEEN ?1 AND ?2`)
    .bind(from, `${to}T23:59:59.999Z`)
    .all<{ n: number }>();
  return results[0]?.n ?? 0;
}

async function countByEvent(db: SummaryD1, eventType: string, from: string, to: string): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) as n FROM analytics_events WHERE event_type = ?1 AND occurred_at BETWEEN ?2 AND ?3`,
    )
    .bind(eventType, from, `${to}T23:59:59.999Z`)
    .all<{ n: number }>();
  return results[0]?.n ?? 0;
}

async function countByEventGrouped(
  db: SummaryD1,
  eventTypes: string[],
  from: string,
  to: string,
): Promise<Record<string, number>> {
  const placeholders = eventTypes.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await db
    .prepare(
      `SELECT event_type, COUNT(*) as n FROM analytics_events
       WHERE event_type IN (${placeholders}) AND occurred_at BETWEEN ?${eventTypes.length + 1} AND ?${eventTypes.length + 2}
       GROUP BY event_type`,
    )
    .bind(...eventTypes, from, `${to}T23:59:59.999Z`)
    .all<{ event_type: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.event_type, r.n]));
}

async function groupByToolAndEvent(
  db: SummaryD1,
  from: string,
  to: string,
): Promise<Array<{ tool_id: string; event_type: string; n: number }>> {
  const { results } = await db
    .prepare(
      `SELECT tool_id, event_type, COUNT(*) as n FROM analytics_events
       WHERE tool_id IS NOT NULL AND occurred_at BETWEEN ?1 AND ?2
       GROUP BY tool_id, event_type`,
    )
    .bind(from, `${to}T23:59:59.999Z`)
    .all<{ tool_id: string; event_type: string; n: number }>();
  return results;
}

async function groupByErrorCategory(
  db: SummaryD1,
  from: string,
  to: string,
): Promise<Array<{ error_category: string; n: number }>> {
  const { results } = await db
    .prepare(
      `SELECT error_category, COUNT(*) as n FROM analytics_events
       WHERE event_type = 'processing_error' AND error_category IS NOT NULL AND occurred_at BETWEEN ?1 AND ?2
       GROUP BY error_category`,
    )
    .bind(from, `${to}T23:59:59.999Z`)
    .all<{ error_category: string; n: number }>();
  return results;
}

async function groupByOversizedBucket(
  db: SummaryD1,
  from: string,
  to: string,
): Promise<Array<{ oversized_parts_bucket: string; n: number }>> {
  const { results } = await db
    .prepare(
      `SELECT oversized_parts_bucket, COUNT(*) as n FROM analytics_events
       WHERE event_type = 'oversized_parts_result' AND oversized_parts_bucket IS NOT NULL AND occurred_at BETWEEN ?1 AND ?2
       GROUP BY oversized_parts_bucket`,
    )
    .bind(from, `${to}T23:59:59.999Z`)
    .all<{ oversized_parts_bucket: string; n: number }>();
  return results;
}

async function groupByField(
  db: SummaryD1,
  field: "utm_source" | "referrer_host",
  from: string,
  to: string,
): Promise<Array<{ value: string; n: number }>> {
  const { results } = await db
    .prepare(
      `SELECT ${field} as value, COUNT(*) as n FROM analytics_events
       WHERE ${field} IS NOT NULL AND occurred_at BETWEEN ?1 AND ?2
       GROUP BY ${field}
       ORDER BY n DESC
       LIMIT 20`,
    )
    .bind(from, `${to}T23:59:59.999Z`)
    .all<{ value: string; n: number }>();
  return results;
}

async function dailyEvolutionQuery(
  db: SummaryD1,
  from: string,
  to: string,
): Promise<Array<{ day: string; n: number }>> {
  const { results } = await db
    .prepare(
      `SELECT substr(occurred_at, 1, 10) as day, COUNT(*) as n FROM analytics_events
       WHERE occurred_at BETWEEN ?1 AND ?2
       GROUP BY day
       ORDER BY day ASC`,
    )
    .bind(from, `${to}T23:59:59.999Z`)
    .all<{ day: string; n: number }>();
  return results;
}
