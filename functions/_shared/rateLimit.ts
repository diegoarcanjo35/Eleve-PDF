/**
 * Rate limit defensivo, em memória, por isolate do Worker — camada
 * local/best-effort, NÃO uma proteção distribuída ou autoritativa.
 *
 * AVISO IMPORTANTE: Cloudflare pode executar múltiplos isolates do mesmo
 * Worker simultaneamente e reciclá-los a qualquer momento — este contador
 * NÃO é compartilhado entre isolates nem sobrevive a reciclagem. Ele reduz
 * abuso trivial e picos acidentais de um único cliente dentro de uma janela
 * curta, mas **não é** e **não deve ser classificado como** uma proteção
 * distribuída/autoritativa suficiente contra abuso — em particular, NÃO É
 * suficiente, por si só, para uma exposição pública de IA paga (Workers AI,
 * OpenAI, ou qualquer provedor cobrado por uso). Reaproveitado nos endpoints
 * de Analytics (sem custo por chamada) e de Inteligência Documental — Sprint
 * 01B — que hoje só criam sessão/chunk local, sem nenhuma chamada de IA.
 *
 * GATE TÉCNICO — ANTES de qualquer exposição pública de inferência paga
 * (Workers AI, OpenAI/Luna, embeddings, etc.), este limitador em memória
 * precisa ser substituído ou complementado por uma solução autoritativa e
 * distribuída adequada à infraestrutura escolhida (ex.: Cloudflare Rate
 * Limiting Rules/WAF na borda, ou um contador centralizado — KV/Durable
 * Object/D1 — dimensionado por benchmark real). Essa solução NÃO foi
 * escolhida nem implementada nesta sprint — não presumir que este gate já
 * está fechado só porque um rate limiter existe no código.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 10_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_TRACKED_KEYS = 5000; // limite defensivo de memória do próprio isolate

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      // Descarta a chave mais antiga para não crescer sem limite — proteção
      // de memória do isolate, não uma política de expiração precisa.
      const firstKey = buckets.keys().next().value;
      if (firstKey !== undefined) buckets.delete(firstKey);
    }
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);
  if (bucket.timestamps.length >= MAX_REQUESTS_PER_WINDOW) return true;

  bucket.timestamps.push(now);
  return false;
}

/** Exportado só para os testes limparem o estado entre casos. */
export function __resetRateLimitStateForTests(): void {
  buckets.clear();
}
