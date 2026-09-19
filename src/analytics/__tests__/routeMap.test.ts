import { describe, expect, it } from "vitest";
import { pathToRouteId } from "../routeMap";
import { SEO_PAGES } from "@shared/seo/pages";

describe("pathToRouteId — mapeamento de rota pública para identificador analítico", () => {
  it("mapeia /termos-de-uso para o identificador termos-de-uso", () => {
    expect(pathToRouteId("/termos-de-uso")).toBe("termos-de-uso");
  });

  it("continua mapeando as rotas já existentes", () => {
    expect(pathToRouteId("/")).toBe("home");
    expect(pathToRouteId("/compactar-pdf")).toBe("compactar-pdf");
    expect(pathToRouteId("/dividir-pdf-por-tamanho")).toBe("dividir-pdf-por-tamanho");
    expect(pathToRouteId("/privacidade")).toBe("privacidade");
  });

  it("mapeia /juntar-pdfs para o identificador juntar-pdfs (Fase 3.1)", () => {
    expect(pathToRouteId("/juntar-pdfs")).toBe("juntar-pdfs");
  });

  it("mapeia /conversar-com-pdf para o identificador conversar-com-pdf (Fase 01, Sprint 01F)", () => {
    expect(pathToRouteId("/conversar-com-pdf")).toBe("conversar-com-pdf");
  });

  it("/admin/analytics continua fora do mapeamento (nenhum page_view gerado)", () => {
    expect(pathToRouteId("/admin/analytics")).toBeNull();
  });

  it("consistência sitemap × taxonomia: os sete caminhos públicos do sitemap (shared/seo/pages.ts) têm identificador analítico", () => {
    for (const page of SEO_PAGES) {
      expect(pathToRouteId(page.path)).not.toBeNull();
    }
    expect(SEO_PAGES).toHaveLength(7);
  });
});
