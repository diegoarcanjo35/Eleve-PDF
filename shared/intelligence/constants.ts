/**
 * Constantes da Inteligência Documental (Fase 01, Sprint 01B).
 *
 * Todos os valores abaixo são hipóteses operacionais desta sprint, não
 * decisões comerciais ou de produto finais — ver
 * docs/inteligencia-documental/decisoes-em-aberto.md. Centralizados aqui de
 * propósito para nunca espalhar magic numbers pelo código.
 */

/** Versão do contrato de ingestão (`shared/intelligence/types.ts`). Incrementar
 * sempre que o formato do payload mudar de forma incompatível. */
export const INGESTION_CONTRACT_VERSION = "1";

// --- Sessão temporária ---
/** TTL da sessão temporária. Hipótese operacional — o valor comercial final
 * ainda não foi decidido. */
export const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos

// --- Limites de abuso/ingestão (hipóteses operacionais, não comerciais) ---
export const MAX_INGEST_BODY_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_PAGES_PER_DOCUMENT = 500;
export const MAX_CHARS_TOTAL = 2_000_000;
export const MAX_BLOCKS_TOTAL = 50_000;
/** Corte defensivo por bloco isolado — nenhum bloco legítimo produzido pela
 * extração local (Sprint 01A) deveria se aproximar disso; existe só para
 * limitar o dano de um payload malformado/hostil. */
export const MAX_BLOCK_CHARS = 20_000;

// --- Chunking (hipóteses operacionais, ver Fase 01 Etapa 02) ---
export const CHUNK_TARGET_CHARS = 1200;
export const CHUNK_MAX_CHARS = 1500;
/** ~10–15% hipotetizado na Etapa 02; 0.12 fica no meio da faixa. */
export const CHUNK_OVERLAP_RATIO = 0.12;
/** Versionamento explícito do algoritmo de chunking — persistido em cada
 * chunk e na sessão, para nunca precisar adivinhar depois qual estratégia
 * gerou um chunk específico. */
export const CHUNKING_STRATEGY_VERSION = "v1-natural-break-char-target";
