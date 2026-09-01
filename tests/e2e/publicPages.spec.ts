import { test, expect } from "@playwright/test";

test.describe("Fase 2.2 — navegação pública: Home, Termos, Privacidade e 404", () => {
  test("navega da Home para Termos e Privacidade pelo Footer, e volta para a Home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Termos de Uso" })).not.toBeVisible();

    await page.getByRole("link", { name: "Termos de Uso" }).click();
    await expect(page).toHaveURL(/\/termos-de-uso$/);
    await expect(page.getByRole("heading", { name: "Termos de Uso", level: 1 })).toBeVisible();

    const footer = page.getByRole("contentinfo");
    await footer.getByRole("link", { name: /Privacidade e métricas/i }).click();
    await expect(page).toHaveURL(/\/privacidade$/);
    await expect(page.getByRole("heading", { name: "Privacidade e métricas", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Home" }).first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("uma rota desconhecida renderiza a página 404 do próprio app, com link de volta para a Home", async ({
    page,
  }) => {
    await page.goto("/uma-rota-que-nao-existe-de-verdade");
    await expect(page.getByText(/página não encontrada/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /voltar para a home/i })).toBeVisible();

    await page.getByRole("link", { name: /voltar para a home/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
