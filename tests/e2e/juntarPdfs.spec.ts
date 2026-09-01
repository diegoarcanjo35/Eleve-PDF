import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { getPageContentText } from "./pdfInspect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);
const STANDARD_FONT_DATA_URL = pathToFileURL(
  path.join(__dirname, "..", "..", "node_modules", "pdfjs-dist", "standard_fonts") + path.sep,
).href;

async function downloadToBuffer(page: import("@playwright/test").Page, trigger: () => Promise<void>) {
  const downloadPromise = page.waitForEvent("download");
  await trigger();
  const download = await downloadPromise;
  const filePath = await download.path();
  if (!filePath) throw new Error("Download não gravou um arquivo local (path() retornou null).");
  return { buffer: fs.readFileSync(filePath), suggestedFilename: download.suggestedFilename() };
}

/** Marcador embutido em cada página das fixtures merge-source-a/b.pdf pelo
 *  gerador (scripts/generate-fixtures.ts): "juntar-fonte-a-pagina-N" ou
 *  "juntar-fonte-b-pagina-N". Usado como segundo sinal de proveniência
 *  (além do tamanho de página), independente do nome do arquivo. */
function extractSourceMarker(text: string): string | null {
  const match = text.match(/juntar-fonte-([ab])-pagina-(\d+)/);
  return match ? `${match[1]}${match[2]}` : null;
}

/** Extrai, na ordem das páginas do PDF baixado, o par [tamanho da página,
 *  marcador de origem] — dois sinais independentes de proveniência, nenhum
 *  deles o nome do arquivo. */
function getPageSizesAndMarkers(doc: PDFDocument): { sizes: string[]; markers: (string | null)[] } {
  const sizes: string[] = [];
  const markers: (string | null)[] = [];
  for (let i = 0; i < doc.getPageCount(); i += 1) {
    const { width, height } = doc.getPage(i).getSize();
    sizes.push(`${width}x${height}`);
    markers.push(extractSourceMarker(getPageContentText(doc, i)));
  }
  return { sizes, markers };
}

/** Extração REAL de texto pesquisável via pdfjs-dist (build legacy, compatível
 *  com Node — sem DOM/Worker), a mesma biblioteca já usada pelo projeto para
 *  validação de PDFs (src/lib/validation.ts), aqui rodando fora do navegador
 *  para inspecionar o arquivo efetivamente baixado. Diferente do proxy
 *  estrutural usado nos testes unitários (presença de recurso de fonte), isto
 *  comprova que o texto é de fato extraível, não apenas que a fonte foi copiada. */
async function extractRealTextMarkers(buffer: Buffer): Promise<(string | null)[]> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  });
  const doc = await loadingTask.promise;
  const markers: (string | null)[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      markers.push(extractSourceMarker(text));
    }
  } finally {
    await doc.destroy();
  }
  return markers;
}

test.describe("ElevePDF — Juntar PDFs (E2E real: input → worker → pdf-lib → download → PDF válido)", () => {
  test("junta dois PDFs reais, respeita a ordem escolhida na interface, e o PDF baixado é válido com texto pesquisável real", async ({
    page,
  }) => {
    await page.goto("/juntar-pdfs");
    await page.locator('input[type="file"]').setInputFiles([fixture("merge-source-a.pdf"), fixture("merge-source-b.pdf")]);

    // 1) os dois arquivos aparecem, com nome e contagem de páginas corretos
    const list = page.getByRole("list", { name: /arquivos selecionados/i });
    await expect(list).toBeVisible();
    await expect(page.getByText("merge-source-a.pdf")).toBeVisible();
    await expect(page.getByText("merge-source-b.pdf")).toBeVisible();
    await expect(page.getByText(/2 páginas/)).toBeVisible();
    await expect(page.getByText(/3 páginas/)).toBeVisible();
    await expect(page.getByText("Pronto")).not.toHaveCount(0);

    // 2) reordena usando os controles REAIS da interface: ordem de upload foi
    // [a, b] — move "a" para baixo, então a ordem final passa a ser [b, a].
    await page.getByRole("button", { name: "Mover merge-source-a.pdf para baixo na ordem" }).click();
    const items = list.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("merge-source-b.pdf");
    await expect(items.nth(1)).toContainText("merge-source-a.pdf");

    // 3) aciona a junção real (worker real → pdf-lib real)
    await page.getByRole("button", { name: "Juntar 2 PDFs" }).click();
    const resultCard = page.locator(".result-card");
    await expect(resultCard.getByText("União concluída")).toBeVisible({ timeout: 20000 });
    await expect(resultCard.getByText("5", { exact: true })).toBeVisible(); // total de páginas: 3 (b) + 2 (a)

    // 4) baixa o arquivo de verdade e captura o download com o Playwright
    const { buffer, suggestedFilename } = await downloadToBuffer(page, async () => {
      await page.getByRole("button", { name: "Baixar PDF único" }).click();
    });
    expect(suggestedFilename).toBe("documentos-unidos.pdf");

    // 5) fora da interface: confirma que é um PDF válido de verdade
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(5);

    // 6) ordem comprovada por DOIS sinais independentes — nenhum deles o nome
    // do arquivo: tamanho de página (b = 300x500, a = 400x600) e marcador de
    // texto embutido por página. b vem primeiro (foi movida antes de "a").
    const { sizes, markers } = getPageSizesAndMarkers(doc);
    expect(sizes).toEqual(["300x500", "300x500", "300x500", "400x600", "400x600"]);
    expect(markers).toEqual(["b1", "b2", "b3", "a1", "a2"]);

    // 7) PROVA DE TEXTO PESQUISÁVEL: extração real via pdfjs-dist (mesma lib
    // já usada pelo projeto), não apenas o proxy estrutural dos testes
    // unitários. Confirma que os textos determinísticos de AMBOS os arquivos
    // originais continuam extraíveis do PDF baixado, na ordem esperada.
    const realTextMarkers = await extractRealTextMarkers(buffer);
    expect(realTextMarkers).toEqual(["b1", "b2", "b3", "a1", "a2"]);
  });
});

test.describe("ElevePDF — Juntar PDFs (E2E: aviso de estrutura especial)", () => {
  test("avisa sobre estruturas de nível de documento antes de juntar e exige confirmação explícita", async ({
    page,
  }) => {
    await page.goto("/juntar-pdfs");
    await page.locator('input[type="file"]').setInputFiles([fixture("simple-1-page.pdf"), fixture("sensitive-structures.pdf")]);

    await expect(page.getByText("simple-1-page.pdf")).toBeVisible();
    await expect(page.getByText("sensitive-structures.pdf")).toBeVisible();
    await expect(page.getByText(/estruturas de nível de documento/i)).toBeVisible();

    const mergeButton = page.getByRole("button", { name: "Juntar 2 PDFs" });
    await expect(mergeButton).toBeDisabled();

    await page.getByLabel(/entendo o risco/i).check();
    await expect(mergeButton).toBeEnabled();
  });
});
