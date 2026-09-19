import type { IntelligenceD1 } from "./intelligenceDb";
import { deriveNetworkIdentity } from "./networkIdentity";

/**
 * Rate limit distribuído e AUTORITATIVO, persistido em D1 — ao contrário de
 * `_shared/rateLimit.ts` (em memória, por isolate, best-effort), este
 * contador é lido/escrito atomicamente no D1, que serializa TODA escrita
 * pela sua instância primária (confirmado via documentação oficial na
 * auditoria Sprint 01E: "All write queries are still forwarded to the
 * primary database instance", mesmo com read replication habilitada) —
 * garantindo que requisições concorrentes vindas de isolates/PoPs
 * diferentes nunca ultrapassem silenciosamente o limite.
 *
 * `rateLimit.ts` (em memória) continua ativo em todos os endpoints como
 * PRIMEIRA barreira barata — este módulo nunca o substitui, só o
 * complementa (ver ordem de barreiras nos endpoints e item 15 do prompt da
 * Sprint 01E.1).
 */

export type RateLimitOutcome = "allowed" | "blocked" | "error";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

function currentWindowBucket(windowMs: number, nowMs: number): number {
  return Math.floor(nowMs / windowMs);
}

/**
 * Consumo atômico de uma janela fixa — UMA única instrução
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE`, nunca um `SELECT` seguido de
 * `UPDATE` em JavaScript (que abriria uma janela de corrida real entre
 * requisições concorrentes — exatamente o que o item 7 da Sprint 01E.1
 * proíbe). Mesmo princípio de prova por `meta.changes` já usado em
 * `claimSessionForIngest`/`markSessionReady` (`intelligenceDb.ts`): a
 * cláusula `WHERE count < ?` só permite a atualização (e portanto
 * `changes > 0`) quando a janela ainda tem vaga; se a condição falhar, a
 * linha permanece inalterada e `changes === 0` — aqui, "limite excedido".
 */
export async function consumeRateLimitWindow(
  db: IntelligenceD1,
  rateKey: string,
  config: RateLimitConfig,
  nowMs: number = Date.now(),
): Promise<RateLimitOutcome> {
  const windowBucket = currentWindowBucket(config.windowMs, nowMs);
  const fullKey = `${rateKey}:${windowBucket}`;
  const windowStartIso = new Date(windowBucket * config.windowMs).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  try {
    const result = await db
      .prepare(
        `INSERT INTO intelligence_rate_limit_windows (rate_key, window_start, count, updated_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(rate_key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
         WHERE count < ?`,
      )
      .bind(fullKey, windowStartIso, nowIso, config.maxRequests)
      .run();
    return result.meta.changes > 0 ? "allowed" : "blocked";
  } catch {
    return "error";
  }
}

/**
 * Ponto único usado pelos endpoints: deriva a identidade de rede
 * pseudonimizada, compõe a chave (operação + identidade de rede + sessão,
 * quando houver) e consome a janela — uma única dimensão nunca é
 * suficiente sozinha (item 10 da Sprint 01E.1): um atacante com muitas
 * sessões ainda esbarra no limite por identidade de rede; um atacante
 * atrás de muitos IPs ainda esbarra no limite por sessão.
 *
 * `sessionId` só entra na chave DEPOIS de já validado por capability em
 * quem chama — nunca antes (ver ordem de barreiras nos endpoints) — para
 * que citar um `sessionId` alheio sem prová-lo nunca consuma/envenene o
 * limite de outra sessão.
 *
 * FAIL-CLOSED: sem `hmacKeySecret` configurado, ou qualquer falha ao
 * derivar a identidade ou consumir a janela, retorna "error" — nunca
 * "allowed". Quem chama DEVE tratar "error" como bloqueio (nunca prosseguir
 * para uma operação custosa) — ver item 14 do prompt da Sprint 01E.1.
 */
export async function enforceDistributedRateLimit(
  db: IntelligenceD1,
  hmacKeySecret: string | undefined,
  params: { operation: string; ip: string; sessionId?: string },
  config: RateLimitConfig,
): Promise<RateLimitOutcome> {
  if (!hmacKeySecret) return "error";

  let networkIdentity: string;
  try {
    networkIdentity = await deriveNetworkIdentity(params.ip, hmacKeySecret);
  } catch {
    return "error";
  }

  const rateKey = params.sessionId
    ? `${params.operation}:${networkIdentity}:${params.sessionId}`
    : `${params.operation}:${networkIdentity}`;

  return consumeRateLimitWindow(db, rateKey, config);
}
