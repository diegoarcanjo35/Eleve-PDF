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
 * gerou um chunk específico.
 *
 * v2 (Sprint 01L.1): acrescenta `pageSpans` (proveniência granular por
 * página dentro de `chunk.text`) a cada chunk. O TEXTO/tamanho/overlap dos
 * chunks é idêntico à v1 para a mesma entrada — só o metadado de
 * proveniência mudou, nunca o algoritmo de corte em si (ver
 * `chunking.test.ts`, "texto idêntico à v1"). */
export const CHUNKING_STRATEGY_VERSION = "v2-natural-break-char-target-page-spans";

// --- Retrieval (Fase 01, Sprint 01C) ---
/** Versão do contrato de retrieval (pergunta -> chunks recuperados). */
export const RETRIEVAL_CONTRACT_VERSION = "1";
export const MAX_RETRIEVE_BODY_BYTES = 8 * 1024; // 8 KB — só a pergunta, nunca documento
/** Hipótese operacional — tamanho máximo de pergunta aceito. */
export const MAX_QUERY_CHARS = 2000;
/** topK controlado só pelo servidor — nunca aceito do cliente (ver retrieve.ts). */
export const RETRIEVAL_TOP_K = 5;

// --- Embeddings (Fase 01, Sprint 01C) ---
/** Modelo de embedding usado exclusivamente pelo Eleve PDF nesta sprint —
 * nenhum fallback, nenhum modelo alternativo. */
export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
/** Dimensionalidade confirmada tanto pela documentação pública do BGE-M3
 * quanto pela configuração real do índice Vectorize `elevepdf-conversar-pdf-embeddings`
 * (`wrangler vectorize get`) e, nesta sprint, por uma chamada real ao modelo —
 * ver relatório Sprint 01C. */
export const EMBEDDING_DIMENSIONS = 1024;
/** Tamanho de lote por chamada a `env.AI.run()` — hipótese operacional; a
 * documentação da Workers AI não expõe um limite máximo de itens por batch
 * para `@cf/baai/bge-m3` (só limite de requisições/minuto, e contexto de
 * 60.000 tokens por item). Valor conservador, nunca verificado contra um
 * teto oficial de batch. */
export const EMBEDDING_BATCH_SIZE = 20;
/** Versionamento explícito da configuração de embedding — persistido na
 * sessão e na metadata de cada vetor, para nunca precisar adivinhar depois
 * qual modelo/config gerou um vetor específico. */
export const EMBEDDING_STRATEGY_VERSION = "v1-bge-m3-1024-cosine";

// --- Consistência eventual do Vectorize (Sprint 01C.1) ---
/**
 * `upsert()`/`deleteByIds()` do Vectorize são assíncronos: retornam um
 * `mutationId` sem garantir que os vetores já estão consultáveis. Medido
 * empiricamente nesta sprint (validação real, ver relatório Sprint 01C.1):
 * um upsert ainda não estava visível numa query ~8s depois, e já estava
 * visível ~23s depois — UMA amostra real, não um SLA documentado pela
 * Cloudflare. Este valor é uma hipótese operacional conservadora (bem acima
 * do único ponto de dado observado), não uma garantia.
 */
export const VECTORIZE_PROPAGATION_GRACE_MS = 60_000;
/** Única espera curta e limitada antes de reconsultar o Vectorize quando a
 * primeira consulta não retorna nenhum resultado — nunca um loop de
 * polling, nunca uma espera longa/indefinida. */
export const RETRIEVAL_EMPTY_RETRY_DELAY_MS = 1500;

// --- Geração fundamentada com Luna (Fase 01, Sprint 01D) ---
export const ASK_CONTRACT_VERSION = "1";
export const MAX_ASK_BODY_BYTES = 8 * 1024; // 8 KB — só a pergunta, nunca documento
/** Hipótese operacional — tamanho máximo de pergunta aceito. */
export const MAX_QUESTION_CHARS = 2000;

/** Modelo de geração usado exclusivamente nesta vertical — nenhum fallback,
 * nenhum outro modelo, nenhum outro provider. A abstração de provider
 * permanece futura (ver docs/inteligencia-documental/01-blueprint-tecnico.md). */
export const LUNA_MODEL = "gpt-5.6-luna";
/** Hipótese operacional da primeira vertical — nunca medium/high/xhigh/max
 * sem benchmark posterior (ver relatório Sprint 01D). */
export const LUNA_REASONING_EFFORT = "low";
/** Começa pequeno de propósito — não é limite comercial definitivo. Alto o
 * suficiente para acomodar tokens de raciocínio (contam como output em
 * modelos de reasoning) sem truncar a resposta estruturada antes do JSON
 * ser emitido — ver achado real na auditoria: `status: "incomplete"` com
 * `incomplete_details.reason: "max_output_tokens"` pode deixar a saída sem
 * nenhum item `message`, só `reasoning`. */
export const LUNA_MAX_OUTPUT_TOKENS = 800;
/** Versionamento explícito da configuração de geração — persistido na
 * telemetria, para nunca precisar adivinhar depois qual config gerou uma
 * resposta específica. */
export const LUNA_STRATEGY_VERSION = "v1-luna-low-structured-json";

/** Máximo de chunks enviados como evidência ao Luna — reaproveita o mesmo
 * teto já usado pelo retrieval (nunca maior que ele). */
export const MAX_CONTEXT_CHUNKS = RETRIEVAL_TOP_K;
/** Limite agregado defensivo de caracteres de evidência enviados ao Luna —
 * acima do teórico atual (RETRIEVAL_TOP_K × CHUNK_MAX_CHARS), mas existe
 * para nunca depender só desses outros limites não estourarem no futuro. */
export const MAX_CONTEXT_CHARS_TOTAL = 8000;

// --- Rate limit distribuído autoritativo (Fase 01, Sprint 01E.1) ---
/**
 * HIPÓTESE INICIAL — todos os valores abaixo, validar por benchmark/uso
 * real antes de qualquer lançamento público (ver relatório de auditoria
 * Sprint 01E, e relatório de implementação Sprint 01E.1). Deliberadamente
 * conservadores para testar a arquitetura, nunca limites comerciais
 * definitivos — nunca confundir com plano/crédito (ver
 * docs/inteligencia-documental/adr/0004-plano-separado-de-creditos.md).
 */
export const RATE_LIMIT_WINDOW_MS = 60_000; // janela fixa de 1 minuto
/** HIPÓTESE INICIAL — por identidade de rede pseudonimizada. */
export const RATE_LIMIT_SESSION_CREATE_MAX = 10;
/** HIPÓTESE INICIAL — por identidade de rede + sessão autorizada. */
export const RATE_LIMIT_INGEST_MAX = 5;
/** HIPÓTESE INICIAL — por identidade de rede + sessão autorizada. */
export const RATE_LIMIT_RETRIEVE_MAX = 20;
/** HIPÓTESE INICIAL — mais restritivo que retrieve: maior custo real (Luna). */
export const RATE_LIMIT_ASK_MAX = 10;
