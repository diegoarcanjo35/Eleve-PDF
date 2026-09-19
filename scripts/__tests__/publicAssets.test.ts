import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const publicPath = (name: string) => resolve(process.cwd(), "public", name);

function pngDimensions(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  // IHDR chunk: width/height são uint32 big-endian nos bytes 16..23 do PNG.
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("Ativos públicos — favicon, ícones e imagem OG", () => {
  it("favicon.svg existe", () => {
    expect(existsSync(publicPath("favicon.svg"))).toBe(true);
  });

  it("apple-touch-icon.png existe e tem 180×180", () => {
    const path = publicPath("apple-touch-icon.png");
    expect(existsSync(path)).toBe(true);
    expect(pngDimensions(path)).toEqual({ width: 180, height: 180 });
  });

  it("og-elevepdf.png existe, é PNG válido e tem exatamente 1200×630", () => {
    const path = publicPath("og-elevepdf.png");
    expect(existsSync(path)).toBe(true);
    const buf = readFileSync(path);
    // Assinatura PNG: 89 50 4E 47 0D 0A 1A 0A
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(pngDimensions(path)).toEqual({ width: 1200, height: 630 });
    // Tamanho razoável para compartilhamento (não vazio, não gigante).
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.length).toBeLessThan(2 * 1024 * 1024);
  });
});

describe("robots.txt e sitemap.xml", () => {
  it("robots.txt permite indexação e aponta para o sitemap correto", () => {
    const content = readFileSync(publicPath("robots.txt"), "utf-8");
    expect(content).toMatch(/Allow:\s*\//);
    expect(content).toContain("Sitemap: https://elevepdf.elevesites.com.br/sitemap.xml");
    // Não deve usar Disallow como se fosse proteção de segurança.
    expect(content).not.toMatch(/Disallow:\s*\/admin/i);
  });

  it("sitemap.xml lista exatamente as sete URLs públicas, nenhuma outra (Fase 01: Converse com PDF)", () => {
    const content = readFileSync(publicPath("sitemap.xml"), "utf-8");
    const urls = [...content.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

    expect(urls).toEqual([
      "https://elevepdf.elevesites.com.br/",
      "https://elevepdf.elevesites.com.br/compactar-pdf",
      "https://elevepdf.elevesites.com.br/dividir-pdf-por-tamanho",
      "https://elevepdf.elevesites.com.br/juntar-pdfs",
      "https://elevepdf.elevesites.com.br/conversar-com-pdf",
      "https://elevepdf.elevesites.com.br/privacidade",
      "https://elevepdf.elevesites.com.br/termos-de-uso",
    ]);

    for (const url of urls) {
      expect(url).not.toMatch(/admin/i);
      expect(url).not.toMatch(/404/);
      expect(url).not.toMatch(/localhost/i);
      expect(url).not.toMatch(/\.pages\.dev/i);
      expect(url).not.toContain("?");
      expect(url).not.toContain("#");
    }
  });
});
