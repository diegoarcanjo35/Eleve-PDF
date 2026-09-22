import { describe, expect, it } from "vitest";
import { buildSitemapXml, isEleveIaEnabledForBuild, isEleveIaPublicForBuild, seoPageForBuild } from "../seoBuildHelpers";
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

describe("isEleveIaPublicForBuild (Sprint 01P)", () => {
  it("não pública quando VITE_ELEVE_IA_PUBLIC está ausente do env passado", () => {
    expect(isEleveIaPublicForBuild({})).toBe(false);
  });

  it("não pública para qualquer valor diferente de \"true\"", () => {
    expect(isEleveIaPublicForBuild({ VITE_ELEVE_IA_PUBLIC: "false" })).toBe(false);
    expect(isEleveIaPublicForBuild({ VITE_ELEVE_IA_PUBLIC: "1" })).toBe(false);
  });

  it("pública só quando exatamente \"true\"", () => {
    expect(isEleveIaPublicForBuild({ VITE_ELEVE_IA_PUBLIC: "true" })).toBe(true);
  });
});

describe("seoPageForBuild — modo piloto fechado vs. público (Sprint 01P)", () => {
  it("ligada mas NÃO pública (piloto fechado): /conversar-com-pdf fica noindex, sem canonical", () => {
    const result = seoPageForBuild(conversarPage, true, false);
    expect(result.robots).toBe("noindex, nofollow");
    expect(result.canonical).toBe(false);
  });

  it("ligada E pública: SEO normal, idêntico ao comportamento anterior a esta sprint", () => {
    const result = seoPageForBuild(conversarPage, true, true);
    expect(result).toEqual(conversarPage);
  });

  it("terceiro parâmetro omitido preserva o comportamento anterior a esta sprint (default: pública)", () => {
    expect(seoPageForBuild(conversarPage, true)).toEqual(seoPageForBuild(conversarPage, true, true));
  });

  it("desligada permanece noindex independentemente de eleveIaPublic (kill switch sempre vence)", () => {
    expect(seoPageForBuild(conversarPage, false, true).robots).toBe("noindex, nofollow");
    expect(seoPageForBuild(conversarPage, false, false).robots).toBe("noindex, nofollow");
  });

  it("outras rotas nunca são afetadas por eleveIaPublic", () => {
    expect(seoPageForBuild(homePage, true, false)).toEqual(homePage);
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

  it("Sprint 01P: ligada mas em modo piloto fechado (não pública) — sitemap não contém /conversar-com-pdf", () => {
    const pages = SEO_PAGES.map((page) => seoPageForBuild(page, true, false));
    const xml = buildSitemapXml(pages);
    expect(xml).not.toContain("/conversar-com-pdf");
    expect(xml).toContain("/compactar-pdf</loc>"); // demais rotas continuam presentes
  });
});
