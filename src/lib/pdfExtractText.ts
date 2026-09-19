import * as pdfjsLib from "pdfjs-dist";
import { PdfAppError } from "./errors";

/**
 * Motor de extração textual local — Fase 01 (Inteligência Documental,
 * "Converse com PDF"), Sprint 01A. Roda inteiramente dentro do Web Worker,
 * igual aos motores de Compactar/Dividir/Juntar — o PDF original nunca sai
 * do navegador.
 *
 * Usa `pdfjs-dist` (já dependência do projeto) como fonte primária de
 * conteúdo textual via `page.getTextContent()` — a mesma lib já usada por
 * `validation.ts` para validar/contar páginas, agora também para ler
 * conteúdo. O contrato exportado aqui é PRÓPRIO do domínio (não o tipo
 * `TextItem` do pdfjs) — só a camada efêmera interna (`RawTextRun`) espelha
 * o pdfjs, e nunca sai desta função.
 *
 * NÃO faz chunking, não gera embeddings, não chama nenhum serviço remoto —
 * escopo estritamente limitado a extração + normalização + proveniência por
 * página, conforme a Sprint 01A.
 */

// ---------------------------------------------------------------------------
// Contrato de domínio (exportado) — desacoplado dos tipos internos do pdfjs
// ---------------------------------------------------------------------------

export type PageExtractionStatus = "text" | "no-text" | "failed";

export interface TextBlock {
  /** Já normalizado — ver `normalizeRunsIntoBlocks`. */
  text: string;
  /** Sistema de coordenadas do próprio PDF (unidades de página, não pixels
   *  de tela/DPI) — o mesmo espaço de `PDFPageProxy.view`. */
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface ExtractedPage {
  /** 1-based — a própria fonte de proveniência (nunca reindexado). */
  pageNumber: number;
  status: PageExtractionStatus;
  /** Vazio quando `status !== "text"`. */
  blocks: TextBlock[];
  /** De `PDFPageProxy.view` — largura/altura reais da página (MediaBox),
   *  mesmo sistema de coordenadas de `TextBlock.boundingBox`. `{0,0}`
   *  quando `status === "failed"` (página não pôde nem ser aberta). */
  pageSize: { width: number; height: number };
}

export interface ExtractedDocument {
  pageCount: number;
  pages: ExtractedPage[];
  /** "ok": todas as páginas com texto útil. "partial": mistura de páginas
   *  com texto e páginas sem texto/com falha. "unsupported": nenhuma
   *  página produziu texto útil (ex.: PDF totalmente escaneado) — a
   *  aplicação deve informar que este tipo de PDF ainda não é suportado,
   *  sem tentar nenhum fallback remoto nesta sprint. */
  overallStatus: "ok" | "partial" | "unsupported";
}

export interface ExtractProgress {
  stage: "reading" | "extracting" | "finalizing";
  pagesProcessed: number;
  totalPages: number;
}

/**
 * Limiar operacional (não decisão definitiva de produto — ver Fase 01,
 * Etapa 02, seção 2) de caracteres não-espaço, já normalizados, para uma
 * página ser considerada `"text"` em vez de `"no-text"`. HIPÓTESE A
 * VALIDAR: nomeado e centralizado aqui de propósito para ser fácil de
 * ajustar quando houver benchmark real contra documentos variados.
 */
export const MIN_USABLE_TEXT_CHARS = 20;

// ---------------------------------------------------------------------------
// Camada efêmera — espelho mínimo de TextItem, nunca exposta fora deste
// módulo (não faz parte do contrato público/remoto).
// ---------------------------------------------------------------------------

interface RawTextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
  /** Mantido só na camada bruta — não decidimos usar direção de texto no
   *  contrato final nesta sprint (ver Sprint 01A, "camada efêmera"). */
  dir: string;
}

// `TextContent` não é reexportado pelo módulo raiz "pdfjs-dist" (só por
// caminhos internos do pacote) — derivamos o tipo a partir do retorno real
// de `PDFPageProxy.getTextContent()`, que É público, em vez de depender de
// um caminho de import interno e frágil entre versões.
type TextContentResult = Awaited<ReturnType<pdfjsLib.PDFPageProxy["getTextContent"]>>;

function collectRawRuns(textContent: TextContentResult): RawTextRun[] {
  const runs: RawTextRun[] = [];
  for (const item of textContent.items) {
    if (!("str" in item)) continue; // TextMarkedContent — sem texto, descartado
    const transform = item.transform;
    runs.push({
      str: item.str,
      x: transform[4] as number,
      y: transform[5] as number,
      width: item.width,
      height: item.height,
      hasEOL: item.hasEOL,
      dir: item.dir,
    });
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Normalização — regras seguras e determinísticas (ver Sprint 01A)
// ---------------------------------------------------------------------------

/**
 * Remove caracteres de controle não usados por nós (preserva \n/\t, que só
 * existem depois de nós mesmos os inserirmos — nunca chegam assim do
 * pdfjs). Construída a partir de códigos numéricos, não de um literal de
 * regex com escapes Unicode, para não depender de bytes de controle
 * literais dentro do próprio código-fonte.
 */
function buildControlCharPattern(): RegExp {
  const ranges: Array<[number, number]> = [
    [0x00, 0x08],
    [0x0b, 0x0c],
    [0x0e, 0x1f],
    [0x7f, 0x7f],
  ];
  const hex = (n: number) => "\\u" + n.toString(16).padStart(4, "0");
  const source = ranges
    .map(([start, end]) => (start === end ? hex(start) : hex(start) + "-" + hex(end)))
    .join("");
  return new RegExp("[" + source + "]", "g");
}

const CONTROL_CHAR_PATTERN = buildControlCharPattern();

/** Espaço/tab colapsados, controle removido, NFC — nunca de-hifeniza
 *  (deliberadamente fora de escopo desta sprint, ver Sprint 01A). */
function cleanText(text: string): string {
  return text
    .replace(CONTROL_CHAR_PATTERN, "")
    .replace(/[ \t]+/g, " ")
    .normalize("NFC")
    .trim();
}

/** Junta o texto de uma linha respeitando vãos horizontais reais entre
 *  itens (evita "colar" palavras quando o pdfjs não incluiu o espaço no
 *  próprio item) — não é reconstrução editorial, só espaçamento por vão
 *  geométrico, determinístico. */
function joinRunsText(runs: RawTextRun[]): string {
  let result = "";
  let prevEndX: number | null = null;
  for (const run of runs) {
    if (prevEndX !== null) {
      const gap = run.x - prevEndX;
      if (gap > 1 && !result.endsWith(" ") && !run.str.startsWith(" ")) {
        result += " ";
      }
    }
    result += run.str;
    prevEndX = run.x + run.width;
  }
  return result;
}

function boundingBoxOf(runs: RawTextRun[]): TextBlock["boundingBox"] {
  const minX = Math.min(...runs.map((r) => r.x));
  const minY = Math.min(...runs.map((r) => r.y));
  const maxX = Math.max(...runs.map((r) => r.x + r.width));
  const maxY = Math.max(...runs.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Agrupa runs em linhas por `hasEOL` (o próprio pdfjs já resolve quebra de
 * linha — não recalculamos por heurística de posição), concatena com
 * espaçamento por vão, limpa e normaliza. Itens efetivamente vazios são
 * descartados, mas sua intenção de quebra de linha (`hasEOL`) é respeitada
 * antes do descarte. Cada linha não-vazia vira um `TextBlock`.
 */
function normalizeRunsIntoBlocks(runs: RawTextRun[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  let lineRuns: RawTextRun[] = [];

  function flushLine() {
    if (lineRuns.length === 0) return;
    const text = cleanText(joinRunsText(lineRuns));
    if (text.length > 0) {
      blocks.push({ text, boundingBox: boundingBoxOf(lineRuns) });
    }
    lineRuns = [];
  }

  for (const run of runs) {
    const isEmptyItem = run.str.trim().length === 0;
    if (isEmptyItem && lineRuns.length === 0) {
      // Item vazio isolado (ex.: espaço solto no início) — descarta o
      // conteúdo, mas preserva a quebra de linha que ele sinalizasse.
      if (run.hasEOL) flushLine();
      continue;
    }
    lineRuns.push(run);
    if (run.hasEOL) flushLine();
  }
  flushLine(); // última linha, se a página não terminou com hasEOL

  return blocks;
}

// ---------------------------------------------------------------------------
// Extração de ponta a ponta
// ---------------------------------------------------------------------------

/**
 * Extrai texto com proveniência determinística por página, de um PDF já
 * validado (ver `validation.ts` — esta função não revalida assinatura/
 * tamanho, assume que o chamador já passou por `validatePdfBytes`).
 *
 * Falha de UMA página nunca derruba o documento inteiro — é isolada e
 * marcada como `"failed"` naquela página especificamente, permitindo que
 * as demais páginas continuem sendo processadas normalmente.
 */
export async function extractDocumentText(
  bytes: Uint8Array,
  onProgress?: (progress: ExtractProgress) => void,
  isCancelled?: () => boolean,
): Promise<ExtractedDocument> {
  onProgress?.({ stage: "reading", pagesProcessed: 0, totalPages: 0 });

  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
  });
  const doc = await loadingTask.promise;

  try {
    const pageCount = doc.numPages;
    const pages: ExtractedPage[] = [];

    for (let i = 1; i <= pageCount; i += 1) {
      if (isCancelled?.()) {
        throw new PdfAppError("processing-failed", "Operação cancelada pelo usuário.");
      }
      onProgress?.({ stage: "extracting", pagesProcessed: i - 1, totalPages: pageCount });

      try {
        const page = await doc.getPage(i);
        try {
          const view = page.view; // [x1, y1, x2, y2]
          const pageSize = { width: view[2]! - view[0]!, height: view[3]! - view[1]! };
          const textContent = await page.getTextContent();
          const runs = collectRawRuns(textContent);
          const blocks = normalizeRunsIntoBlocks(runs);
          const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
          const status: PageExtractionStatus =
            totalChars >= MIN_USABLE_TEXT_CHARS ? "text" : "no-text";
          pages.push({ pageNumber: i, status, blocks, pageSize });
        } finally {
          page.cleanup();
        }
      } catch (error) {
        if (error instanceof PdfAppError) throw error; // cancelamento propaga
        pages.push({ pageNumber: i, status: "failed", blocks: [], pageSize: { width: 0, height: 0 } });
      }

      onProgress?.({ stage: "extracting", pagesProcessed: i, totalPages: pageCount });
    }

    onProgress?.({ stage: "finalizing", pagesProcessed: pageCount, totalPages: pageCount });

    const hasUsableText = pages.some((p) => p.status === "text");
    const hasUnusablePage = pages.some((p) => p.status === "no-text" || p.status === "failed");
    const overallStatus: ExtractedDocument["overallStatus"] = !hasUsableText
      ? "unsupported"
      : hasUnusablePage
        ? "partial"
        : "ok";

    return { pageCount, pages, overallStatus };
  } finally {
    await doc.destroy();
  }
}
