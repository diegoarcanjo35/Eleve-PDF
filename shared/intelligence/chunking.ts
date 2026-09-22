import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_RATIO, CHUNK_TARGET_CHARS, CHUNKING_STRATEGY_VERSION } from "./constants";
import type { DocumentChunk, IngestionPageV1, PageSpan } from "./types";

/**
 * INVARIANTE DE SEGURANÇA DE CONTEÚDO: todo texto abaixo (páginas, blocos,
 * chunks) é conteúdo do documento do usuário — DADO, nunca instrução. Esta
 * função, e qualquer código futuro que consome seu resultado, nunca deve
 * interpretar, executar, buscar URLs de, ou tratar como comando nenhum
 * trecho desse texto. Nenhum LLM é chamado nesta sprint; quando um for
 * integrado, o texto de um chunk precisa entrar no contexto do modelo
 * separado do papel de instrução do sistema — nunca por concatenação direta
 * e sem fronteira entre dado e comando.
 */

interface Segment {
  text: string;
  pageNumber: number;
}

function flattenIntoSegments(pages: IngestionPageV1[]): Segment[] {
  const segments: Segment[] = [];
  for (const page of pages) {
    for (const block of page.blocks) {
      segments.push({ text: block.text, pageNumber: page.pageNumber });
    }
  }
  return segments;
}

/** Garante que nenhum segmento sozinho ultrapasse CHUNK_MAX_CHARS — corte
 * duro por tamanho, aplicado só ao segmento isolado que excede o limite
 * (prioridade 3 da estratégia: cortes naturais primeiro, tamanho por
 * último). Nunca aplicado a segmentos que já cabem inteiros num chunk. */
function splitOversizedSegments(segments: Segment[]): Segment[] {
  const result: Segment[] = [];
  for (const segment of segments) {
    if (segment.text.length <= CHUNK_MAX_CHARS) {
      result.push(segment);
      continue;
    }
    for (let start = 0; start < segment.text.length; start += CHUNK_MAX_CHARS) {
      result.push({
        text: segment.text.slice(start, start + CHUNK_MAX_CHARS),
        pageNumber: segment.pageNumber,
      });
    }
  }
  return result;
}

function joinSegments(segments: Segment[]): string {
  return segments.map((s) => s.text).join("\n");
}

/**
 * Proveniência granular (Sprint 01L.1): mapeia cada segmento de `segments`
 * ao intervalo exato que ele ocupa no texto que `joinSegments(segments)`
 * produziria — mesma aritmética de offset, nunca recalculada de forma
 * aproximada. Segmentos contíguos da MESMA página são fundidos num único
 * span (caso comum); uma mudança de página, ou a mesma página reaparecendo
 * depois de outra (ex.: por causa do overlap), sempre inicia um span novo.
 * `startOffset` inclusivo, `endOffset` exclusivo — `chunk.text.slice(span.startOffset, span.endOffset)`
 * sempre reproduz o trecho exato daquela página, incluindo os `\n` internos
 * quando o span abrange mais de um segmento.
 */
function computePageSpans(segments: Segment[]): PageSpan[] {
  const spans: PageSpan[] = [];
  let offset = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const startOffset = offset;
    const endOffset = startOffset + segment.text.length;
    const last = spans[spans.length - 1];
    if (last && last.page === segment.pageNumber && last.endOffset === startOffset) {
      last.endOffset = endOffset;
    } else {
      spans.push({ page: segment.pageNumber, startOffset, endOffset });
    }
    offset = endOffset;
    if (i < segments.length - 1) offset += 1; // separador "\n" de joinSegments
  }
  return spans;
}

/** Cauda de segmentos (blocos inteiros, nunca cortados no meio) do chunk que
 * acabou de fechar, usada para semear o próximo chunk — overlap por
 * fronteira natural de bloco, não por corte bruto de caracteres. */
function overlapTailSegments(segments: Segment[]): Segment[] {
  const overlapTargetChars = Math.round(CHUNK_TARGET_CHARS * CHUNK_OVERLAP_RATIO);
  if (overlapTargetChars <= 0) return [];

  const tail: Segment[] = [];
  let accumulated = 0;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]!;
    // Nunca usa, sozinho, um segmento maior ou igual ao próprio alvo de
    // chunk como overlap — isso duplicaria quase o chunk inteiro em vez de
    // só prover continuidade de contexto (caso raro: segmento veio de corte
    // duro por tamanho, ver splitOversizedSegments). Sem overlap aqui é
    // preferível a um overlap que não cumpre seu propósito.
    if (tail.length === 0 && segment.text.length >= CHUNK_TARGET_CHARS) return [];
    if (accumulated > 0 && accumulated + segment.text.length > overlapTargetChars) break;
    tail.unshift(segment);
    accumulated += segment.text.length;
    if (accumulated >= overlapTargetChars) break;
  }
  return tail;
}

/**
 * Chunking determinístico, executado só no backend (nunca no navegador).
 * Prioriza cortes naturais — fronteiras de bloco já produzidas pela
 * normalização local da Sprint 01A — sobre corte por tamanho puro. Cada
 * chunk mantém `pages` com a proveniência exata das páginas que
 * contribuíram seu texto; nunca adivinhada depois. Constantes de
 * alvo/máximo/overlap em `constants.ts`, versionadas via
 * CHUNKING_STRATEGY_VERSION.
 */
export function chunkDocument(pages: IngestionPageV1[]): DocumentChunk[] {
  const segments = splitOversizedSegments(flattenIntoSegments(pages));
  if (segments.length === 0) return [];

  const chunks: DocumentChunk[] = [];
  let current: Segment[] = [];

  function pushCurrentAsChunk(): Segment[] {
    const overlapSeed = overlapTailSegments(current);
    const pageNumbers = Array.from(new Set(current.map((s) => s.pageNumber))).sort((a, b) => a - b);
    chunks.push({
      index: chunks.length,
      text: joinSegments(current),
      startPage: pageNumbers[0]!,
      endPage: pageNumbers[pageNumbers.length - 1]!,
      pages: pageNumbers,
      chunkingStrategyVersion: CHUNKING_STRATEGY_VERSION,
      pageSpans: computePageSpans(current),
    });
    return overlapSeed;
  }

  for (const segment of segments) {
    const wouldBeLength =
      current.length === 0 ? segment.text.length : joinSegments(current).length + 1 + segment.text.length;
    if (current.length > 0 && wouldBeLength > CHUNK_MAX_CHARS) {
      current = pushCurrentAsChunk();
    }

    current.push(segment);

    if (joinSegments(current).length >= CHUNK_TARGET_CHARS) {
      current = pushCurrentAsChunk();
    }
  }

  if (current.length > 0) {
    // Cauda residual final: fecha mesmo abaixo do alvo — nunca descartada.
    pushCurrentAsChunk();
  }

  return chunks;
}
