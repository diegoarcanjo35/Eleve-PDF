import { CLEANUP_RATE_LIMIT_WINDOW_RETENTION_MS, CLEANUP_SESSION_BATCH_SIZE } from "../../shared/intelligence/constants";

/**
 * Cleanup automático de dados temporários da Inteligência Documental
 * (Sprint 01P). Fecha o débito registrado desde a migration 0001: sessões
 * expiradas, seus chunks (que guardam o TEXTO real do documento do usuário)
 * e os vetores correspondentes no Vectorize nunca eram apagados
 * automaticamente — só manualmente, como em todos os gates anteriores.
 *
 * ARQUITETURA (ver relatório da sprint para a auditoria completa): Pages
 * Functions não suporta `scheduled`/cron nativamente — só `onRequest*`. A
 * função pura abaixo é desenhada para ser chamada por um Worker separado e
 * mínimo, com seu próprio cron trigger, reaproveitando os MESMOS bindings
 * D1/Vectorize (ver `workers/intelligence-cleanup/`). Nada aqui depende de
 * `EventContext` do Pages — só dos bindings crus, para poder ser importada
 * de qualquer runtime Workers sem acoplamento a rota HTTP.
 *
 * INVARIANTES DE SEGURANÇA:
 * - Uma sessão só é elegível quando `expires_at` já passou (nunca antes).
 * - Ordem de deleção por sessão: vetores Vectorize -> chunks D1 (apaga o
 *   texto) -> sessão D1 (só bookkeeping). Nunca a ordem inversa: se a sessão
 *   fosse apagada antes dos chunks e o processo falhasse no meio, os chunks
 *   (com texto) ficariam orfãos mas continuariam existindo e legíveis, sem
 *   nenhum registro de que ainda precisam ser limpos.
 * - Se a deleção no Vectorize falhar para uma sessão, os chunks/sessão dessa
 *   sessão NUNCA são apagados nesta invocação — os IDs de chunk (necessários
 *   para tentar de novo) só existem enquanto as linhas de
 *   `intelligence_chunks` continuarem no D1. Perder essa linha perderia a
 *   capacidade de retry. A sessão simplesmente continua elegível na próxima
 *   invocação (mesmo critério: `expires_at` já passado).
 * - Idempotente: `Vectorize.deleteByIds` para IDs já inexistentes não é erro
 *   (confirmado empiricamente em gates anteriores — resposta "index não
 *   contém vetores correspondentes", nunca uma exceção); `DELETE ... WHERE`
 *   sobre linhas já ausentes é sempre um no-op seguro em SQL. Repetir a
 *   invocação inteira, mesmo com sobreposição de trabalho já feito, nunca
 *   corrompe nem duplica nada.
 */

/** Interface mínima de D1 necessária aqui — nunca o `IntelligenceD1`
 * completo de `intelligenceDb.ts` (que não expõe `.all()`, desnecessário
 * para os outros endpoints). Compatível estruturalmente com o binding real
 * `D1Database` do Cloudflare Workers, então `env.INTEL_DB` real pode ser
 * passado direto, sem cast. */
export interface CleanupD1 {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
}

export interface CleanupEnv {
  INTEL_DB: CleanupD1;
  VECTORIZE: Vectorize;
}

export interface SessionCleanupOutcome {
  sessionId: string;
  vectorsDeleted: number;
  chunksDeleted: number;
  sessionDeleted: boolean;
  /** `true` quando a deleção no Vectorize falhou (exceção) — a sessão foi
   * deliberadamente deixada intacta no D1 para retry numa invocação futura. */
  failed: boolean;
}

export interface CleanupResult {
  scanned: number;
  sessions: SessionCleanupOutcome[];
  rateLimitWindowsDeleted: number;
}

async function getExpiredSessionIds(db: CleanupD1, nowIso: string, limit: number): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT id FROM intelligence_sessions WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?`)
    .bind(nowIso, limit)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

async function getChunkIdsForSession(db: CleanupD1, sessionId: string): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT id FROM intelligence_chunks WHERE session_id = ?`)
    .bind(sessionId)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

async function cleanupOneSession(env: CleanupEnv, sessionId: string): Promise<SessionCleanupOutcome> {
  const chunkIds = await getChunkIdsForSession(env.INTEL_DB, sessionId);

  if (chunkIds.length > 0) {
    try {
      await env.VECTORIZE.deleteByIds(chunkIds);
    } catch {
      // Falha real do Vectorize (não "IDs inexistentes", que nunca lança) —
      // não prossegue para o D1. A sessão continua elegível na próxima
      // invocação, com os mesmos chunkIds ainda recuperáveis.
      return { sessionId, vectorsDeleted: 0, chunksDeleted: 0, sessionDeleted: false, failed: true };
    }
  }

  const chunksResult = await env.INTEL_DB.prepare(`DELETE FROM intelligence_chunks WHERE session_id = ?`).bind(sessionId).run();
  const sessionResult = await env.INTEL_DB.prepare(`DELETE FROM intelligence_sessions WHERE id = ?`).bind(sessionId).run();

  return {
    sessionId,
    vectorsDeleted: chunkIds.length,
    chunksDeleted: chunksResult.meta.changes,
    sessionDeleted: sessionResult.meta.changes > 0,
    failed: false,
  };
}

/** Limpeza independente das janelas antigas de rate limit — deliberadamente
 * separada da limpeza de sessões/chunks/vetores acima (retenção de
 * documento do usuário nunca deve se misturar com bookkeeping de rate
 * limit). Só remove janelas mais antigas que
 * `CLEANUP_RATE_LIMIT_WINDOW_RETENTION_MS` — nunca janelas recentes. */
async function cleanupOldRateLimitWindows(db: CleanupD1, nowMs: number): Promise<number> {
  const cutoffIso = new Date(nowMs - CLEANUP_RATE_LIMIT_WINDOW_RETENTION_MS).toISOString();
  const result = await db.prepare(`DELETE FROM intelligence_rate_limit_windows WHERE window_start < ?`).bind(cutoffIso).run();
  return result.meta.changes;
}

/**
 * Ponto de entrada único do cleanup — chamado pelo `scheduled()` do Worker
 * dedicado (`workers/intelligence-cleanup/index.ts`). Processa até
 * `CLEANUP_SESSION_BATCH_SIZE` sessões expiradas por invocação (nunca um
 * scan/delete ilimitado) e, à parte, limpa janelas antigas de rate limit.
 */
export async function runIntelligenceCleanup(
  env: CleanupEnv,
  now: Date = new Date(),
  batchSize: number = CLEANUP_SESSION_BATCH_SIZE,
): Promise<CleanupResult> {
  const nowIso = now.toISOString();
  const expiredIds = await getExpiredSessionIds(env.INTEL_DB, nowIso, batchSize);

  const sessions: SessionCleanupOutcome[] = [];
  for (const sessionId of expiredIds) {
    sessions.push(await cleanupOneSession(env, sessionId));
  }

  const rateLimitWindowsDeleted = await cleanupOldRateLimitWindows(env.INTEL_DB, now.getTime());

  return { scanned: expiredIds.length, sessions, rateLimitWindowsDeleted };
}
