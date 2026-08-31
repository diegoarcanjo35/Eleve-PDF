import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

test.describe("ElevePDF — fluxo principal", () => {
  test("mostra marca, slogan e área de upload no primeiro viewport", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Seu PDF no tamanho certo.")).toBeVisible();
    await expect(page.getByText(/arraste um pdf aqui/i)).toBeVisible();
  });

  test("rejeita um arquivo que não é PDF com mensagem clara", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(fixture("not-a-pdf.txt"));
    await expect(page.getByRole("alert")).toContainText(/não é um pdf válido/i);
  });

  test("valida um PDF real e exibe nome, tamanho e número de páginas", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(fixture("multi-page-text.pdf"));
    await expect(page.getByText("multi-page-text.pdf")).toBeVisible();
    await expect(page.getByText(/14 páginas/)).toBeVisible();
    await expect(page.getByText(/pronto para processar/i)).toBeVisible();
  });

  test("divide um PDF real respeitando o limite escolhido e permite baixar o ZIP", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(fixture("multi-page-text.pdf"));
    await expect(page.getByText(/pronto para processar/i)).toBeVisible();

    await page.getByRole("tab", { name: "Dividir por tamanho" }).click();
    await page.getByRole("radio", { name: "1 MB" }).click();
    await page.getByRole("button", { name: "Dividir PDF" }).click();

    await expect(page.getByText(/divisão concluída/i)).toBeVisible({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar todas em ZIP" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test("compacta um PDF real e mostra tamanho original, final e redução", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(fixture("with-images.pdf"));
    await expect(page.getByText(/pronto para processar/i)).toBeVisible();

    await page.getByRole("button", { name: "Compactar PDF" }).click();

    await expect(page.getByText(/compactação concluída/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Tamanho original")).toBeVisible();
    await expect(page.getByText("Tamanho final")).toBeVisible();
    await expect(page.getByText("Redução")).toBeVisible();
  });

  test("funciona em viewport mobile", async ({ page, isMobile }) => {
    await page.goto("/");
    await expect(page.getByText("Seu PDF no tamanho certo.")).toBeVisible();
    if (isMobile) {
      const box = await page.getByText(/selecionar arquivo/i).boundingBox();
      expect(box?.width).toBeGreaterThan(0);
    }
  });
});
