/**
 * Rate limit defensivo, em memória, por isolate do Worker.
 *
 * AVISO IMPORTANTE (documentado também no relatório): Cloudflare pode executar
 * múltiplos isolates do mesmo Worker simultaneamente e reciclá-los a qualquer
 * momento — este contador NÃO é compartilhado entre isolates nem sobrevive a
 * reciclagem. Ele impede abuso trivial e picos acidentais de um único cliente
 * dentro de uma janela curta, mas **não substitui** uma proteção distribuída
 * real (ex.: Cloudflare Rate Limiting Rules / WAF, que operam na borda antes
 * mesmo de chegar ao Worker). Não deve ser tratado como a única defesa.
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
