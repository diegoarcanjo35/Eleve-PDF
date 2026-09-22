import { describe, expect, it } from "vitest";
import { buildSitemapXml, isEleveIaEnabledForBuild, seoPageForBuild } from "../seoBuildHelpers";
import { SEO_PAGES } from "../../shared/seo/pages";

const conversarPage = SEO_PAGES.find((p) => p.path === "/conversar-com-pdf")!;
const homePage = SEO_PAGES.find((p) => p.path === "/")!;

describe("isEleveIaEnabledForBuild (Sprint 01H.1)", () => {
  it("1. desligada quando VITE_ELEVE_IA_ENABLED está ausente do env passado", () => {
    expect(isEleveIaEnabledForBuild({})).toBe(false);
  });

  it("2. desligada para qualquer valor diferente de \"true\"", () => {
    expect(isEleveIaEnabledForBuild({ VITE_ELEVE_IA_ENABLED: "false" })).toBe(false);
    expect(isEleveIaEnabledForBuild({ VITE_ELEVE_IA_ENABLED: "1" })).toBe(false);
  });

  it("3. ligada só quando exatamente \"true\"", () => {
    expect(isEleveIaEnabledForBuild({ VITE_ELEVE_IA_ENABLED: "true" })).toBe(true);
  });
});

describe("seoPageForBuild — SEO consistente com a flag (Sprint 01H.1)", () => {
  it("10. desligada: /conversar-com-pdf fica noindex, sem canonical", () => {
    const result = seoPageForBuild(conversarPage, false);
    expect(result.robots).toBe("noindex, nofollow");
    expect(result.canonical).toBe(false);
  });

  it("11. ligada: /conversar-com-pdf mantém o SEO normal (index,follow + canonical), inalterado", () => {
    const result = seoPageForBuild(conversarPage, true);
    expect(result).toEqual(conversarPage);
    expect(result.robots).toBe("index, follow");
    expect(result.canonical).toBe(true);
  });

  it("outras rotas nunca são afetadas pela flag", () => {
    expect(seoPageForBuild(homePage, false)).toEqual(homePage);
    expect(seoPageForBuild(homePage, true)).toEqual(homePage);
  });
});

describe("buildSitemapXml — rota some/aparece com a flag (Sprint 01H.1)", () => {
  it("8. desligada: sitemap não contém /conversar-com-pdf", () => {
    const pages = SEO_PAGES.map((page) => seoPageForBuild(page, false));
    const xml = buildSitemapXml(pages);
    expect(xml).not.toContain("/conversar-com-pdf");
    // as demais rotas indexáveis continuam presentes.
    expect(xml).toContain("https://elevepdf.elevesites.com.br/</loc>");
    expect(xml).toContain("/compactar-pdf</loc>");
    expect(xml).toContain("/privacidade</loc>");
  });

  it("9. ligada: sitemap contém /conversar-com-pdf", () => {
    const pages = SEO_PAGES.map((page) => seoPageForBuild(page, true));
    const xml = buildSitemapXml(pages);
    expect(xml).toContain("https://elevepdf.elevesites.com.br/conversar-com-pdf</loc>");
  });

  it("nunca inclui uma rota marcada noindex (ex.: 404-like), só robots index,follow", () => {
    const xml = buildSitemapXml([{ ...homePage, robots: "noindex, nofollow" }]);
    expect(xml).not.toContain("<loc>");
  });
});
