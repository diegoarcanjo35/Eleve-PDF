import type { PersistedAnalyticsEvent } from "../../shared/analytics/validate";

export interface AnalyticsD1 {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
}

/** Insere um evento já validado e com `occurred_at` atribuído pelo servidor
 * (ver `PersistedAnalyticsEvent`) via statement preparado — nunca concatena SQL. */
export async function insertAnalyticsEvent(db: AnalyticsD1, event: PersistedAnalyticsEvent): Promise<void> {
  await db
    .prepare(
      `INSERT INTO analytics_events (
        occurred_at, session_id, event_type, route_id, tool_id, cta_id, outcome,
        error_category, compression_level, parts_bucket, oversized_parts_bucket,
        duration_bucket, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        referrer_host, landing_page
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.occurred_at,
      event.session_id,
      event.event,
      event.route_id ?? null,
      event.tool_id ?? null,
      event.cta_id ?? null,
      event.outcome ?? null,
      event.error_category ?? null,
      event.compression_level ?? null,
      event.parts_bucket ?? null,
      event.oversized_parts_bucket ?? null,
      event.duration_bucket ?? null,
      event.utm_source ?? null,
      event.utm_medium ?? null,
      event.utm_campaign ?? null,
      event.utm_content ?? null,
      event.utm_term ?? null,
      event.referrer_host ?? null,
      event.landing_page ?? null,
    )
    .run();
}
