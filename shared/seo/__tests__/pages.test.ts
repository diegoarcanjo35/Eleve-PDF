import { describe, expect, it } from "vitest";
import { absoluteUrl, findSeoPage, SEO_NOT_FOUND, SEO_PAGES, SEO_PRIVATE_PAGES } from "../pages";

const EXPECTED_PUBLIC_PATHS = [
  "/",
  "/compactar-pdf",
  "/dividir-pdf-por-tamanho",
  "/juntar-pdfs",
  "/privacidade",
  "/termos-de-uso",
];

describe("SEO_PAGES — as seis rotas públicas indexáveis", () => {
  it("contém exatamente as seis rotas esperadas, na ordem certa", () => {
    expect(SEO_PAGES.map((p) => p.path)).toEqual(EXPECTED_PUBLIC_PATHS);
  });

  it("cada rota tem title e description próprios (nenhum duplicado)", () => {
    const titles = SEO_PAGES.map((p) => p.title);
    const descriptions = SEO_PAGES.map((p) => p.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("todas são index,follow, com canonical e OG habilitados", () => {
    for (const page of SEO_PAGES) {
      expect(page.robots).toBe("index, follow");
      expect(page.canonical).toBe(true);
      expect(page.social).toBe(true);
    }
  });

  it("canonical absoluto e correto por rota", () => {
    expect(absoluteUrl("/")).toBe("https://elevepdf.elevesites.com.br/");
    expect(absoluteUrl("/compactar-pdf")).toBe("https://elevepdf.elevesites.com.br/compactar-pdf");
    expect(absoluteUrl("/dividir-pdf-por-tamanho")).toBe(
      "https://elevepdf.elevesites.com.br/dividir-pdf-por-tamanho",
    );
    expect(absoluteUrl("/juntar-pdfs")).toBe("https://elevepdf.elevesites.com.br/juntar-pdfs");
    expect(absoluteUrl("/privacidade")).toBe("https://elevepdf.elevesites.com.br/privacidade");
    expect(absoluteUrl("/termos-de-uso")).toBe("https://elevepdf.elevesites.com.br/termos-de-uso");
  });

  it("nenhuma URL aponta para localhost ou domínio de preview", () => {
    for (const page of SEO_PAGES) {
      const url = absoluteUrl(page.path);
      expect(url).not.toMatch(/localhost/i);
      expect(url).not.toMatch(/\.pages\.dev/i);
      expect(url.startsWith("https://elevepdf.elevesites.com.br")).toBe(true);
    }
  });

  it("compactação não promete redução em todo arquivo, divisão não promete todas as partes dentro do limite", () => {
    const compress = findSeoPage("/compactar-pdf")!;
    const split = findSeoPage("/dividir-pdf-por-tamanho")!;
    expect(compress.description).toMatch(/depende do conteúdo/i);
    expect(split.description).toMatch(/pode gerar uma parte acima do limite/i);
  });
});

describe("Rotas não indexáveis", () => {
  it("/admin/analytics é noindex,nofollow e sem OG", () => {
    const admin = findSeoPage("/admin/analytics")!;
    expect(admin.robots).toBe("noindex, nofollow");
    expect(admin.social).toBe(false);
    expect(SEO_PRIVATE_PAGES).toHaveLength(1);
  });

  it("404 é noindex,nofollow, sem OG e sem canonical", () => {
    expect(SEO_NOT_FOUND.robots).toBe("noindex, nofollow");
    expect(SEO_NOT_FOUND.social).toBe(false);
    expect(SEO_NOT_FOUND.canonical).toBe(false);
  });
});
