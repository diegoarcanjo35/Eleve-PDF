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
  vector_count: number | null;
  embedding_strategy_version: string | null;
  /** Quando a sessão realmente transicionou para `ready` (ISO 8601 UTC) —
   * usado pelo retrieval para julgar se um resultado vazio do Vectorize
   * pode ainda estar em janela de propagação assíncrona. `null` para
   * sessões que nunca chegaram a `ready`. */
  ready_at: string | null;
  /** Hash SHA-256 da `sessionCapability` (Sprint 01E.1) — nunca o segredo
   * bruto. `null` para sessões legadas (anteriores a esta sprint), que
   * nunca são tratadas como autorizadas (ver `_shared/sessionCapability.ts`). */
  capability_hash: string | null;
}

export interface ChunkRow {
  id: string;
  session_id: string;
  chunk_index: number;
  text: string;
  start_page: number;
  end_page: number;
  pages_json: string;
  strategy_version: string;
  /** Sprint 01L.1 — `null` para chunks persistidos antes desta sprint
   * (coluna aditiva, sem backfill — ver migration 0006). JSON de
   * `PageSpan[]`, nunca parseado aqui: quem consome decide como degradar
   * na presença de `null`/JSON inválido (ver `getChunksByIds`). */
  page_spans_json: string | null;
}

export async function createSession(
  db: IntelligenceD1,
  params: { id: string; createdAtIso: string; expiresAtIso: string; capabilityHash: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO intelligence_sessions (id, status, created_at, expires_at, capability_hash) VALUES (?, 'created', ?, ?, ?)`,
    )
    .bind(params.id, params.createdAtIso, params.expiresAtIso, params.capabilityHash)
    .run();
}

export async function getSession(db: IntelligenceD1, id: string): Promise<SessionRow | null> {
  const row = await db
    .prepare(
      `SELECT id, status, created_at, expires_at, page_count, chunk_count, strategy_version,
              vector_count, embedding_strategy_version, ready_at, capability_hash
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

/** Transição `ingesting` -> `indexing`, guardada da mesma forma que
 * `claimSessionForIngest` — marca que o chunking terminou e a indexação
 * semântica (embeddings + Vectorize) começou. Uma sessão nunca pula direto
 * de `ingesting` para `ready`. */
export async function markSessionIndexing(db: IntelligenceD1, id: string): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE intelligence_sessions SET status = 'indexing' WHERE id = ? AND status = 'ingesting'`)
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

/** Só chega a `ready` depois de chunks *e* vetores existirem — nunca antes.
 * Guardado por `status = 'indexing'`: se a indexação não tiver sido
 * corretamente iniciada (`markSessionIndexing`), esta transição não ocorre. */
export async function markSessionReady(
  db: IntelligenceD1,
  id: string,
  params: {
    pageCount: number;
    chunkCount: number;
    strategyVersion: string;
    vectorCount: number;
    embeddingStrategyVersion: string;
    readyAtIso: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE intelligence_sessions
       SET status = 'ready', page_count = ?, chunk_count = ?, strategy_version = ?,
           vector_count = ?, embedding_strategy_version = ?, ready_at = ?
       WHERE id = ? AND status = 'indexing'`,
    )
    .bind(
      params.pageCount,
      params.chunkCount,
      params.strategyVersion,
      params.vectorCount,
      params.embeddingStrategyVersion,
      params.readyAtIso,
      id,
    )
    .run();
}

/** Estado terminal — usado quando o chunking, os embeddings, ou o upsert no
 * Vectorize falham depois do payload já ter sido validado, para nunca
 * deixar a sessão falsamente presa em `ingesting`/`indexing` nem marcada
 * `ready` sem chunks e vetores reais. Aceita falha em qualquer um dos dois
 * estados intermediários. */
export async function markSessionFailed(db: IntelligenceD1, id: string): Promise<void> {
  await db
    .prepare(`UPDATE intelligence_sessions SET status = 'failed' WHERE id = ? AND status IN ('ingesting', 'indexing')`)
    .bind(id)
    .run();
}

/**
 * Busca chunks por ID (chave primária de `intelligence_chunks`) — usado
 * pelo retrieval para recuperar texto/proveniência a partir dos IDs de
 * vetor retornados pelo Vectorize. O D1 permanece a fonte de verdade do
 * texto/proveniência estruturada; o Vectorize só serve como índice.
 * IDs sem linha correspondente são silenciosamente omitidos do resultado
 * (nunca deveria acontecer para uma sessão `ready`, mas não é fatal).
 */
export async function getChunksByIds(db: IntelligenceD1, ids: string[]): Promise<ChunkRow[]> {
  const rows: ChunkRow[] = [];
  for (const id of ids) {
    const row = await db
      .prepare(
        `SELECT id, session_id, chunk_index, text, start_page, end_page, pages_json, strategy_version, page_spans_json
         FROM intelligence_chunks WHERE id = ?`,
      )
      .bind(id)
      .first<ChunkRow>();
    if (row) rows.push(row);
  }
  return rows;
}

export async function insertChunks(db: IntelligenceD1, sessionId: string, chunks: DocumentChunk[]): Promise<void> {
  for (const chunk of chunks) {
    await db
      .prepare(
        `INSERT INTO intelligence_chunks
         (id, session_id, chunk_index, text, start_page, end_page, pages_json, strategy_version, page_spans_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(chunk.pageSpans),
      )
      .run();
  }
}
