import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { extractPageNumberMarkers, getPageContentText, pageHasFontResource } from "./pdfInspect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function downloadToBuffer(page: import("@playwright/test").Page, trigger: () => Promise<void>) {
  const downloadPromise = page.waitForEvent("download");
  await trigger();
  const download = await downloadPromise;
  const filePath = await download.path();
  if (!filePath) throw new Error("Download não gravou um arquivo local (path() retornou null).");
  return { buffer: fs.readFileSync(filePath), suggestedFilename: download.suggestedFilename() };
}

test.describe("ElevePDF — primeiro viewport e validação", () => {
  // A partir da Fase 1 (layout de plataforma), a Home é uma página de entrada com
  // as ferramentas em cartões — o upload em si vive nas rotas /compactar-pdf e
  // /dividir-pdf-por-tamanho. Este teste passa a verificar marca, slogan e as
  // chamadas para as duas ferramentas disponíveis já no primeiro viewport.
  test("mostra marca, slogan e chamadas para as ferramentas disponíveis no primeiro viewport", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Seu PDF no tamanho certo")).toBeVisible();
    const heroActions = page.locator(".hero__actions");
    await expect(heroActions.getByRole("link", { name: "Compactar PDF", exact: true })).toBeVisible();
    await expect(heroActions.getByRole("link", { name: "Dividir por tamanho", exact: true })).toBeVisible();
  });

  test("rejeita um arquivo que não é PDF com mensagem clara", async ({ page }) => {
    await page.goto("/compactar-pdf");
    await page.locator('input[type="file"]').setInputFiles(fixture("not-a-pdf.txt"));
    await expect(page.getByRole("alert")).toContainText(/não é um pdf válido/i);
  });

  test("valida um PDF real e exibe nome, tamanho e número de páginas", async ({ page }) => {
    await page.goto("/compactar-pdf");
    await page.locator('input[type="file"]').setInputFiles(fixture("multi-page-text.pdf"));
    await expect(page.getByText("multi-page-text.pdf")).toBeVisible();
    await expect(page.getByText(/14 páginas/)).toBeVisible();
    await expect(page.getByText(/pronto para processar/i)).toBeVisible();
  });

  test("funciona em viewport mobile", async ({ page, isMobile }) => {
    await page.goto("/");
    await expect(page.getByText("Seu PDF no tamanho certo")).toBeVisible();
    if (isMobile) {
      const box = await page
        .locator(".hero__actions")
        .getByRole("link", { name: "Compactar PDF", exact: true })
        .boundingBox();
      expect(box?.width).toBeGreaterThan(0);
    }
  });
});

test.describe("ElevePDF — divisão real (múltiplas partes, ZIP, ordem, limite)", () => {
  test("divide em múltiplas partes reais, cada uma um PDF válido dentro do limite, com ordem correta, e o ZIP contém exatamente essas partes", async ({
    page,
  }) => {
    await page.goto("/dividir-pdf-por-tamanho");
    await page.locator('input[type="file"]').setInputFiles(fixture("large-unique-images.pdf"));
    await expect(page.getByText(/pronto para processar/i)).toBeVisible();

    await page.getByRole("radio", { name: "Personalizado" }).click();
    await page.getByLabel("Tamanho máximo").fill("150");
    await page.getByRole("radio", { name: "KB" }).click();
    await page.getByRole("button", { name: "Dividir PDF" }).click();
    await expect(page.getByText(/divisão concluída/i)).toBeVisible({ timeout: 20000 });

    // A interface deve reportar mais de uma parte — não uma divisão de fachada.
    const heading = await page.locator(".result-card h3").innerText();
    const partCountMatch = heading.match(/(\d+) parte/);
    expect(partCountMatch).not.toBeNull();
    const reportedPartCount = Number(partCountMatch![1]);
    expect(reportedPartCount).toBeGreaterThanOrEqual(2);

    const { buffer: zipBuffer } = await downloadToBuffer(page, async () => {
      await page.getByRole("button", { name: "Baixar todas em ZIP" }).click();
    });

    const zip = await JSZip.loadAsync(zipBuffer);
    const entries = Object.keys(zip.files).filter((name) => name.endsWith(".pdf")).sort();
    expect(entries).toHaveLength(reportedPartCount);
    // nomenclatura sequencial esperada
    for (let i = 0; i < entries.length; i += 1) {
      expect(entries[i]).toBe(`large-unique-images-parte-${String(i + 1).padStart(2, "0")}.pdf`);
    }

    let totalPages = 0;
    const orderedPageNumbers: number[] = [];
    for (const entryName of entries) {
      const entryBytes = await zip.files[entryName]!.async("uint8array");
      const doc = await PDFDocument.load(entryBytes);
      expect(doc.getPageCount()).toBeGreaterThan(0); // reabre e é um PDF válido de verdade
      totalPages += doc.getPageCount();
      // tamanho real do arquivo dentro do ZIP deve respeitar o limite pedido (150 KB),
      // já que nenhuma dessas partes deveria estar marcada como "acima do limite"
      expect(entryBytes.byteLength).toBeLessThanOrEqual(150 * 1024);
      orderedPageNumbers.push(...extractPageNumberMarkers(doc));
    }

    expect(totalPages).toBe(5); // nenhuma página perdida ou duplicada
    expect(orderedPageNumbers).toEqual([1, 2, 3, 4, 5]); // ordem comprovada pelo conteúdo real
  });

  test("página isolada maior que o limite não é cortada nem entregue como se respeitasse o limite", async ({
    page,
  }) => {
    await page.goto("/dividir-pdf-por-tamanho");
    await page.locator('input[type="file"]').setInputFiles(fixture("large-unique-images.pdf"));
    await expect(page.getByText(/pronto para processar/i)).toBeVisible();

    await page.getByRole("radio", { name: "Personalizado" }).click();
    await page.getByLabel("Tamanho máximo").fill("64");
    await page.getByRole("radio", { name: "KB" }).click();
    await page.getByRole("button", { name: "Dividir PDF" }).click();
    await expect(page.getByText(/divisão concluída/i)).toBeVisible({ timeout: 20000 });

    await expect(page.getByText(/acima do limite/i).first()).toBeVisible();
    const badges = await page.locator(".badge--warning").count();
    expect(badges).toBeGreaterThan(0);

    const { buffer: zipBuffer } = await downloadToBuffer(page, async () => {
      await page.getByRole("button", { name: "Baixar todas em ZIP" }).click();
    });
    const zip = await JSZip.loadAsync(zipBuffer);
    const entries = Object.keys(zip.files).filter((name) => name.endsWith(".pdf"));
    let totalPages = 0;
    for (const entryName of entries) {
      const entryBytes = await zip.files[entryName]!.async("uint8array");
      const doc = await PDFDocument.load(entryBytes); // continua um PDF válido, mesmo acima do limite
      totalPages += doc.getPageCount();
      expect(doc.getPageCount()).toBe(1); // nenhuma página cortada — cada parte oversized tem 1 página inteira
    }
    expect(totalPages).toBe(5);
  });
});

test.describe("ElevePDF — compactação real (bytes, imagens, reabertura)", () => {
  for (const level of ["Equilibrada", "Máxima"] as const) {
    test(`nível ${level}: recomprime imagens de verdade, reduz bytes, preserva páginas e texto pesquisável`, async ({
      page,
    }) => {
      await page.goto("/compactar-pdf");
      await page.locator('input[type="file"]').setInputFiles(fixture("with-images.pdf"));
      await expect(page.getByText(/pronto para processar/i)).toBeVisible();

      await page.getByRole("radio", { name: new RegExp(level) }).click();
      await page.getByRole("button", { name: "Compactar PDF" }).click();
      await expect(page.getByText(/compactação concluída/i)).toBeVisible({ timeout: 20000 });

      const statsText = await page.locator(".result-stats").innerText();
      const originalMatch = statsText.match(/TAMANHO ORIGINAL\s*\n?([\d.,]+)\s*(KB|MB|B)/i);
      const finalMatch = statsText.match(/TAMANHO FINAL\s*\n?([\d.,]+)\s*(KB|MB|B)/i);
      expect(originalMatch).not.toBeNull();
      expect(finalMatch).not.toBeNull();

      const toBytes = (value: string, unit: string) => {
        const n = Number(value.replace(",", "."));
        if (unit.toUpperCase() === "MB") return n * 1024 * 1024;
        if (unit.toUpperCase() === "KB") return n * 1024;
        return n;
      };
      const originalBytes = toBytes(originalMatch![1]!, originalMatch![2]!);
      const finalBytes = toBytes(finalMatch![1]!, finalMatch![2]!);
      expect(finalBytes).toBeLessThan(originalBytes); // redução REAL, não alegada

      await expect(page.getByText(/imagens recomprimidas/i)).toBeVisible();
      const imagesText = await page.locator(".result-stats").innerText();
      expect(imagesText).toMatch(/1 de 1/); // a única imagem do fixture foi de fato recomprimida

      const { buffer } = await downloadToBuffer(page, async () => {
        await page.getByRole("button", { name: "Baixar PDF compactado" }).click();
      });

      const doc = await PDFDocument.load(buffer);
      expect(doc.getPageCount()).toBe(6); // mesmo número de páginas do original
      expect(buffer.byteLength).toBeLessThan(originalBytes); // o ARQUIVO baixado também é menor de fato

      const markers = extractPageNumberMarkers(doc);
      expect(markers).toEqual([1, 2, 3, 4, 5, 6]); // ordem das páginas preservada

      for (let i = 0; i < doc.getPageCount(); i += 1) {
        expect(pageHasFontResource(doc, i)).toBe(true); // continua vetorial/texto, não virou imagem
        expect(getPageContentText(doc, i)).toMatch(/pagina-numero-/); // texto real, pesquisável
      }
    });
  }

  test("sem ganho real: o arquivo original é preservado byte a byte e a interface informa isso honestamente", async ({
    page,
  }) => {
    await page.goto("/compactar-pdf");
    await page.locator('input[type="file"]').setInputFiles(fixture("simple-1-page.pdf"));
    await expect(page.getByText(/pronto para processar/i)).toBeVisible();

    await page.getByRole("radio", { name: "Leve" }).click();
    await page.getByRole("button", { name: "Compactar PDF" }).click();
    await expect(page.getByText(/compactação concluída/i)).toBeVisible({ timeout: 20000 });

    await expect(page.getByText(/arquivo original foi mantido/i)).toBeVisible();
    await expect(page.getByText("Nenhuma", { exact: true })).toBeVisible();

    const { buffer } = await downloadToBuffer(page, async () => {
      await page.getByRole("button", { name: "Baixar arquivo original" }).click();
    });

    const originalBytes = fs.readFileSync(fixture("simple-1-page.pdf"));
    expect(Buffer.compare(buffer, originalBytes)).toBe(0); // idêntico, byte a byte
  });
});

test.describe("ElevePDF — estruturas sensíveis (AcroForm, outline, links)", () => {
  test("avisa sobre estruturas de nível de documento antes de dividir e exige confirmação explícita", async ({
    page,
  }) => {
    await page.goto("/dividir-pdf-por-tamanho");
    await page.locator('input[type="file"]').setInputFiles(fixture("sensitive-structures.pdf"));
    await expect(page.getByText(/pronto para processar/i)).toBeVisible();

    await expect(page.getByText(/cada parte da divisão.*pode não preservar/i)).toBeVisible();

    const splitButton = page.getByRole("button", { name: "Dividir PDF" });
    await expect(splitButton).toBeDisabled();

    await page.getByLabel(/entendo o risco/i).check();
    await expect(splitButton).toBeEnabled();
  });
});
