import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { RETENTION_DELETE_SQL, retentionCutoffIso } from "../analyticsRetention";

/**
 * Testa a estratégia de retenção **localmente**, contra um SQLite em memória
 * (Node `node:sqlite`) com o mesmo schema da migration — nunca contra um D1
 * real (não há credenciais/rede envolvidas neste teste).
 */
describe("retenção de eventos analíticos (local, sem banco real)", () => {
  function createLocalDb(): DatabaseSync {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL
      );
    `);
    return db;
  }

  it("remove só eventos mais antigos que 90 dias, preservando os recentes", () => {
    const db = createLocalDb();
    const now = new Date("2026-09-02T12:00:00.000Z");

    const old = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const insert = db.prepare(
      "INSERT INTO analytics_events (occurred_at, session_id, event_type) VALUES (?, ?, ?)",
    );
    insert.run(old, "11111111-1111-4111-8111-111111111111", "page_view");
    insert.run(recent, "22222222-2222-4222-8222-222222222222", "page_view");

    const cutoff = retentionCutoffIso(now);
    db.prepare(RETENTION_DELETE_SQL.replace("?1", "?")).run(cutoff);

    const remaining = db.prepare("SELECT session_id FROM analytics_events").all() as Array<{
      session_id: string;
    }>;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.session_id).toBe("22222222-2222-4222-8222-222222222222");

    db.close();
  });

  it("não remove nada quando todos os eventos estão dentro da janela de retenção", () => {
    const db = createLocalDb();
    const now = new Date("2026-09-02T12:00:00.000Z");
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare("INSERT INTO analytics_events (occurred_at, session_id, event_type) VALUES (?, ?, ?)").run(
      recent,
      "33333333-3333-4333-8333-333333333333",
      "page_view",
    );

    db.prepare(RETENTION_DELETE_SQL.replace("?1", "?")).run(retentionCutoffIso(now));

    const remaining = db.prepare("SELECT COUNT(*) as n FROM analytics_events").get() as { n: number };
    expect(remaining.n).toBe(1);

    db.close();
  });

  it("retentionCutoffIso calcula exatamente 90 dias antes da data de referência", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    const cutoff = new Date(retentionCutoffIso(now));
    const diffDays = (now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(90, 5);
  });
});
