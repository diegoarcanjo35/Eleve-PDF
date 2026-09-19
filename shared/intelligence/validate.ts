import {
  INGESTION_CONTRACT_VERSION,
  MAX_BLOCKS_TOTAL,
  MAX_BLOCK_CHARS,
  MAX_CHARS_TOTAL,
  MAX_PAGES_PER_DOCUMENT,
} from "./constants";
import type { IngestionBlockV1, IngestionPageV1, IngestionPayloadV1 } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBlock(raw: unknown): IngestionBlockV1 | null {
  if (!isPlainObject(raw)) return null;
  const { text } = raw;
  if (typeof text !== "string") return null;
  if (text.length === 0 || text.length > MAX_BLOCK_CHARS) return null;
  return { text };
}

function validatePage(raw: unknown, pageCount: number): IngestionPageV1 | null {
  if (!isPlainObject(raw)) return null;
  const { pageNumber, blocks } = raw;
  if (typeof pageNumber !== "number" || !Number.isInteger(pageNumber)) return null;
  if (pageNumber < 1 || pageNumber > pageCount) return null;
  if (!Array.isArray(blocks)) return null;

  const validatedBlocks: IngestionBlockV1[] = [];
  for (const rawBlock of blocks) {
    const block = validateBlock(rawBlock);
    if (!block) return null;
    validatedBlocks.push(block);
  }
  return { pageNumber, blocks: validatedBlocks };
}

/**
 * Valida (nunca confia em) um payload de ingestão bruto vindo do cliente —
 * pageCount, pageNumber, quantidade de páginas/blocos e tamanho total do
 * texto são todos recomputados/checados aqui, nunca aceitos de olhos
 * fechados. Retorna `null` para qualquer inconsistência, nunca lança.
 *
 * O objeto retornado só contém os campos do contrato (contractVersion,
 * pageCount, pages) — qualquer campo extra enviado pelo cliente (ex.: um
 * nome de arquivo indevidamente incluído) é descartado, nunca propagado.
 */
export function validateIngestionPayload(raw: unknown): IngestionPayloadV1 | null {
  if (!isPlainObject(raw)) return null;

  const { contractVersion, pageCount, pages } = raw;
  if (contractVersion !== INGESTION_CONTRACT_VERSION) return null;
  if (typeof pageCount !== "number" || !Number.isInteger(pageCount)) return null;
  if (pageCount < 1 || pageCount > MAX_PAGES_PER_DOCUMENT) return null;
  if (!Array.isArray(pages)) return null;
  if (pages.length !== pageCount) return null;

  const validatedPages: IngestionPageV1[] = [];
  const seenPageNumbers = new Set<number>();
  let totalChars = 0;
  let totalBlocks = 0;

  for (const rawPage of pages) {
    const page = validatePage(rawPage, pageCount);
    if (!page) return null;
    if (seenPageNumbers.has(page.pageNumber)) return null;
    seenPageNumbers.add(page.pageNumber);

    totalBlocks += page.blocks.length;
    if (totalBlocks > MAX_BLOCKS_TOTAL) return null;
    for (const block of page.blocks) {
      totalChars += block.text.length;
      if (totalChars > MAX_CHARS_TOTAL) return null;
    }

    validatedPages.push(page);
  }

  // Não é preciso checar "faltou algum número de página": pageNumber sempre
  // dentro de [1, pageCount], sem duplicatas, e exatamente `pageCount`
  // páginas — por princípio da casa dos pombos, esses três fatos juntos já
  // garantem que o conjunto é exatamente {1, ..., pageCount}, sem lacunas.
  return { contractVersion: INGESTION_CONTRACT_VERSION, pageCount, pages: validatedPages };
}
