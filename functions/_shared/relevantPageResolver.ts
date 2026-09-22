import type { PageSpan } from "../../shared/intelligence/types";

/**
 * Resolve, de forma 100% local/determinística, qual página específica
 * (dentro de `startPage`–`endPage` de um chunk) melhor sustenta uma
 * resposta — SEM nunca perguntar isso ao modelo (o Structured Output do
 * Luna não tem campo de página, ver `lunaClient.ts`) e sem nenhuma chamada
 * a Workers AI/Vectorize/qualquer serviço externo (Sprint 01L.1).
 *
 * PRINCÍPIO CENTRAL (nunca relaxar): é preferível devolver `undefined`
 * (o cliente cai de volta para a amplitude inteira `startPage`–`endPage`,
 * já em produção desde a Fase 01) do que apontar uma página errada. Por
 * isso o critério de confiança é deliberadamente conservador — não basta
 * "a página com maior pontuação", é preciso que o sinal seja INEQUÍVOCO:
 * pelo menos um termo distintivo da pergunta+resposta que aparece em
 * exatamente UMA página do chunk, e nenhum outro termo distintivo
 * apontando para uma página DIFERENTE (sinal contraditório).
 */

const MIN_TOKEN_LENGTH = 4;

/** Palavras gramaticais comuns em português — nunca tratadas como termo
 * distintivo, mesmo quando atingem `MIN_TOKEN_LENGTH`. Lista heurística,
 * deliberadamente conservadora (prefere incluir demais a de menos: um
 * falso negativo aqui só custa um `undefined` a mais, nunca uma página
 * errada). Já sem acentos — comparada contra texto normalizado. */
const STOPWORDS = new Set([
  "para",
  "com",
  "uma",
  "dos",
  "das",
  "nos",
  "nas",
  "por",
  "sua",
  "seu",
  "suas",
  "seus",
  "esta",
  "este",
  "esse",
  "essa",
  "isso",
  "qual",
  "quais",
  "como",
  "quando",
  "onde",
  "mais",
  "menos",
  "muito",
  "pelo",
  "pela",
  "sem",
  "sao",
  "foi",
  "ser",
  "tem",
  "nao",
  "sim",
  "ate",
  "ainda",
  "entre",
  "sobre",
  "apos",
  "antes",
  "cada",
  "todo",
  "toda",
  "todos",
  "todas",
  "outro",
  "outra",
  "outros",
  "outras",
  "aquele",
  "aquela",
  "aqueles",
  "aquelas",
  "aqui",
  "ali",
  "voce",
  "eles",
  "elas",
  "nosso",
  "nossa",
  "nossos",
  "nossas",
]);

/** Minúsculas + sem diacríticos — comparação tolerante a acento, nunca
 * editorial (não remove nem reescreve palavras). */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Tokens candidatos a "termo distintivo": alfanuméricos (hífen incluso,
 * para preservar códigos como "hz-9274" como um único token), com
 * `MIN_TOKEN_LENGTH` ou mais caracteres, fora da lista de stopwords. */
function distinctiveTokens(text: string): string[] {
  const normalized = normalize(text);
  const raw = normalized.match(/[a-z0-9][a-z0-9-]*/g) ?? [];
  return Array.from(new Set(raw.filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token))));
}

/** Concatena, por página, o texto (normalizado) de todos os spans
 * daquela página — ignora silenciosamente qualquer span malformado
 * (offsets fora dos limites de `chunkText`), nunca lança. */
function buildTextByPage(chunkText: string, pageSpans: PageSpan[]): Map<number, string> {
  const textByPage = new Map<number, string>();
  for (const span of pageSpans) {
    if (span.startOffset < 0 || span.endOffset <= span.startOffset || span.endOffset > chunkText.length) {
      continue;
    }
    const slice = normalize(chunkText.slice(span.startOffset, span.endOffset));
    textByPage.set(span.page, `${textByPage.get(span.page) ?? ""} ${slice}`);
  }
  return textByPage;
}

export interface ResolveRelevantPageParams {
  question: string;
  answer: string;
  chunkText: string;
  /** `undefined` para chunks legados (sem proveniência granular — ver
   * migration 0006) — sempre resolve para `undefined` nesse caso. */
  pageSpans: PageSpan[] | undefined;
}

/**
 * Ver comentário do módulo. Nunca lança — qualquer entrada malformada
 * (spans vazios/inválidos, texto vazio) resolve para `undefined`, nunca
 * um erro que derrubaria a resposta já gerada pelo Luna.
 */
export function resolveRelevantPage(params: ResolveRelevantPageParams): number | undefined {
  const { question, answer, chunkText, pageSpans } = params;
  if (!pageSpans || pageSpans.length === 0) return undefined;

  const textByPage = buildTextByPage(chunkText, pageSpans);
  if (textByPage.size === 0) return undefined;
  if (textByPage.size === 1) return [...textByPage.keys()][0];

  const candidateTokens = [...distinctiveTokens(answer), ...distinctiveTokens(question)];
  if (candidateTokens.length === 0) return undefined;

  // Para cada termo distintivo, descobre em quantas/quais páginas ele
  // aparece. Só termos que aparecem em EXATAMENTE uma página contam como
  // sinal — termos repetidos em duas ou mais páginas (ex.: o nome do
  // projeto, mencionado em toda página) não votam em nenhuma página
  // especificamente, e são corretamente ignorados.
  const uniquePages = new Set<number>();
  for (const token of new Set(candidateTokens)) {
    const pagesWithToken: number[] = [];
    for (const [page, text] of textByPage) {
      if (text.includes(token)) pagesWithToken.push(page);
    }
    if (pagesWithToken.length === 1) uniquePages.add(pagesWithToken[0]!);
  }

  // Confiança exige unanimidade: todo termo distintivo exclusivo de uma
  // página precisa apontar para a MESMA página. Zero termos exclusivos, ou
  // termos exclusivos apontando para páginas DIFERENTES entre si, sempre
  // resolve para `undefined` — nunca "a página com mais votos".
  if (uniquePages.size === 1) return [...uniquePages][0];
  return undefined;
}
