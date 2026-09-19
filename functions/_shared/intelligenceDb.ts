import type { DocumentChunk, SessionStatus } from "../../shared/intelligence/types";

/** D1 dedicado à Inteligência Documental — deliberadamente separado de
 * `AnalyticsD1` (db.ts). Sessões/chunks de IA nunca compartilham tabela ou
 * binding com `analytics_events`. */
export interface IntelligenceD1 {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ meta: { changes: number } }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
    };
  };
}

export interface SessionRow {
  id: string;
  status: SessionStatus;
  created_at: string;
  expires_at: string;
  page_count: number | null;
  chunk_count: number | null;
  strategy_version: string | null;
}

export async function createSession(
  db: IntelligenceD1,
  params: { id: string; createdAtIso: string; expiresAtIso: string },
): Promise<void> {
  await db
    .prepare(`INSERT INTO intelligence_sessions (id, status, created_at, expires_at) VALUES (?, 'created', ?, ?)`)
    .bind(params.id, params.createdAtIso, params.expiresAtIso)
    .run();
}

export async function getSession(db: IntelligenceD1, id: string): Promise<SessionRow | null> {
  const row = await db
    .prepare(
      `SELECT id, status, created_at, expires_at, page_count, chunk_count, strategy_version
       FROM intelligence_sessions WHERE id = ?`,
    )
    .bind(id)
    .first<SessionRow>();
  return row ?? null;
}

/**
 * Transição atômica `created` -> `ingesting`, guardada pela própria condição
 * do WHERE — nunca lê o estado numa etapa e escreve noutra, o que evitaria
 * uma corrida entre duas ingestões concorrentes na mesma sessão. `false`
 * (changes === 0) sempre significa que a sessão já não estava elegível
 * (ingestão em andamento, já concluída, já falhou, ou expirou) — o chamador
 * decide o código HTTP a partir de uma leitura separada só nesse caminho.
 */
export async function claimSessionForIngest(db: IntelligenceD1, id: string, nowIso: string): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE intelligence_sessions SET status = 'ingesting' WHERE id = ? AND status = 'created' AND expires_at > ?`)
    .bind(id, nowIso)
    .run();
  return result.meta.changes > 0;
}

/** Libera a sessão de volta para `created` quando a ingestão falha antes do
 * chunking (payload inválido, JSON malformado) — permite retry determinístico
 * do cliente sem precisar criar uma sessão nova. */
export async function releaseSessionClaim(db: IntelligenceD1, id: string): Promise<void> {
  await db
    .prepare(`UPDATE intelligence_sessions SET status = 'created' WHERE id = ? AND status = 'ingesting'`)
    .bind(id)
    .run();
}

export async function markSessionReady(
  db: IntelligenceD1,
  id: string,
  params: { pageCount: number; chunkCount: number; strategyVersion: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE intelligence_sessions
       SET status = 'ready', page_count = ?, chunk_count = ?, strategy_version = ?
       WHERE id = ? AND status = 'ingesting'`,
    )
    .bind(params.pageCount, params.chunkCount, params.strategyVersion, id)
    .run();
}

/** Estado terminal — usado quando o chunking ou a persistência dos chunks
 * falha depois do payload já ter sido validado, para nunca deixar a sessão
 * falsamente presa em `ingesting` nem marcada `ready` sem chunks reais. */
export async function markSessionFailed(db: IntelligenceD1, id: string): Promise<void> {
  await db
    .prepare(`UPDATE intelligence_sessions SET status = 'failed' WHERE id = ? AND status = 'ingesting'`)
    .bind(id)
    .run();
}

export async function insertChunks(db: IntelligenceD1, sessionId: string, chunks: DocumentChunk[]): Promise<void> {
  for (const chunk of chunks) {
    await db
      .prepare(
        `INSERT INTO intelligence_chunks
         (id, session_id, chunk_index, text, start_page, end_page, pages_json, strategy_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${sessionId}:${chunk.index}`,
        sessionId,
        chunk.index,
        chunk.text,
        chunk.startPage,
        chunk.endPage,
        JSON.stringify(chunk.pages),
        chunk.chunkingStrategyVersion,
      )
      .run();
  }
}
