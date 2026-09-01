import { describe, expect, it } from "vitest";
import { buildWebApplicationJsonLd, jsonLdScriptTag } from "../structuredData";

describe("buildWebApplicationJsonLd — JSON-LD só com propriedades verdadeiras", () => {
  it("produz JSON válido com os campos esperados", () => {
    const data = buildWebApplicationJsonLd("/compactar-pdf", "Descrição de teste.");
    const parsed = JSON.parse(JSON.stringify(data));

    expect(parsed["@type"]).toBe("WebApplication");
    expect(parsed.name).toBe("ElevePDF");
    expect(parsed.url).toBe("https://elevepdf.elevesites.com.br/compactar-pdf");
    expect(parsed.description).toBe("Descrição de teste.");
    expect(parsed.isAccessibleForFree).toBe(true);
  });

  it("nunca inclui propriedades não comprovadas (rating, review, preço, org jurídica)", () => {
    const data = buildWebApplicationJsonLd("/", "x") as unknown as Record<string, unknown>;
    expect(data).not.toHaveProperty("aggregateRating");
    expect(data).not.toHaveProperty("review");
    expect(data).not.toHaveProperty("offers");
    expect(data).not.toHaveProperty("author");
    expect(data).not.toHaveProperty("award");
    expect(data).not.toHaveProperty("publisher");
  });

  it("jsonLdScriptTag gera uma tag <script type=application/ld+json> com JSON parseável", () => {
    const data = buildWebApplicationJsonLd("/", "x");
    const tag = jsonLdScriptTag(data);
    expect(tag.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(tag.endsWith("</script>")).toBe(true);
    const inner = tag.replace('<script type="application/ld+json">', "").replace("</script>", "");
    expect(() => JSON.parse(inner)).not.toThrow();
  });
});
