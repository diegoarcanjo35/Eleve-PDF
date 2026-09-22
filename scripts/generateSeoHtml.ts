/**
 * Pós-processamento do build (`vite build`): gera um HTML estático por rota
 * pública, com título, descrição, canonical, robots, OG/Twitter e JSON-LD já
 * presentes no HTML inicial — sem depender de JavaScript rodar para um
 * crawler (WhatsApp, indexador) ver esses metadados. Não é SSR: o mesmo
 * bundle React/Router de sempre continua sendo carregado por todas as
 * páginas geradas, e assume a renderização normalmente no cliente.
 *
 * Cada arquivo é escrito como `dist/<rota>.html` (não `dist/<rota>/index.html`)
 * de propósito: no Cloudflare Pages, uma requisição para `/compactar-pdf`
 * resolve para `compactar-pdf.html` como correspondência direta, com 200 —
 * sem o redirecionamento 308 que aconteceria se só existisse
 * `compactar-pdf/index.html` (aí a URL exata do canonical não bateria com a
 * URL que realmente responde 200). A Home continua em `dist/index.html`
 * (correspondência exata para "/").
 *
 * Fonte única dos metadados: `shared/seo/pages.ts` e `shared/seo/structuredData.ts`
 * — nada aqui duplica texto que já existe lá.
 *
 * Uso: `npx tsx scripts/generateSeoHtml.ts` (rodado automaticamente depois de
 * `vite build`, ver o script "build" em package.json).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { absoluteUrl, SEO_NOT_FOUND, SEO_PAGES, SEO_PRIVATE_PAGES, type SeoPageMeta } from "../shared/seo/pages";
import { buildWebApplicationJsonLd, jsonLdScriptTag } from "../shared/seo/structuredData";
import { buildSitemapXml, isEleveIaEnabledForBuild, isEleveIaPublicForBuild, seoPageForBuild } from "./seoBuildHelpers";

const DIST_DIR = resolve("dist");

/** Ver `scripts/seoBuildHelpers.ts` (Sprint 01H.1) — lógica pura, testada à
 * parte em `scripts/__tests__/seoBuildHelpers.test.ts`. A consistência com a
 * flag do backend (`ELEVE_IA_ENABLED`) é garantida ANTES do build, por
 * `scripts/validateEleveIaFlag.ts` — este script só lê o lado do frontend. */
const ELEVE_IA_ENABLED = isEleveIaEnabledForBuild();
/** Ver `scripts/seoBuildHelpers.ts` (Sprint 01P) — modo piloto fechado vs.
 * público, independente de `ELEVE_IA_ENABLED`. */
const ELEVE_IA_PUBLIC = isEleveIaPublicForBuild();

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Substitui `<meta name="X" ...content="...">` (ou `property="X"`), tolerando
 * a tag estar formatada em uma ou várias linhas, como no `index.html` fonte. */
function replaceMeta(html: string, attr: "name" | "property", key: string, newContent: string): string {
  const regex = new RegExp(`<meta\\s+${attr}="${escapeRegex(key)}"\\s+content="[^"]*"\\s*/>`, "s");
  const replacement = `<meta ${attr}="${key}" content="${newContent}" />`;
  return regex.test(html) ? html.replace(regex, replacement) : html;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Aplica os metadados de `page` a uma cópia do HTML-base (o `dist/index.html`
 * já construído pelo Vite, com todas as tags de asset corretas). */
function injectMeta(baseHtml: string, page: SeoPageMeta, includeJsonLd: boolean): string {
  let html = baseHtml;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const url = absoluteUrl(page.path);

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = replaceMeta(html, "name", "description", description);
  html = replaceMeta(html, "name", "robots", page.robots);

  if (page.canonical) {
    const canonicalRegex = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/s;
    const replacement = `<link rel="canonical" href="${url}" />`;
    html = canonicalRegex.test(html) ? html.replace(canonicalRegex, replacement) : html;
  } else {
    // 404 (e qualquer outra rota marcada canonical:false) nunca aponta um
    // canonical indexável — remove a tag inteira em vez de apontar para si.
    html = html.replace(/\s*<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/s, "");
  }

  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:url", url);
  html = replaceMeta(html, "name", "twitter:title", title);
  html = replaceMeta(html, "name", "twitter:description", description);

  if (includeJsonLd) {
    const jsonLd = jsonLdScriptTag(buildWebApplicationJsonLd(page.path, page.description));
    html = html.replace("</head>", `  ${jsonLd}\n  </head>`);
  }

  return html;
}

function writeRouteFile(relativePath: string, html: string) {
  const target = resolve(DIST_DIR, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, "utf-8");
  console.log(`  ${relativePath}`);
}

function main() {
  const indexPath = resolve(DIST_DIR, "index.html");
  if (!existsSync(indexPath)) {
    console.error("dist/index.html não encontrado — rode `vite build` antes deste script.");
    process.exitCode = 1;
    return;
  }
  const baseHtml = readFileSync(indexPath, "utf-8");

  console.log("Gerando HTML estático por rota:");

  // Home: já nasce correto pelo próprio index.html fonte (ver index.html na
  // raiz do projeto) — só adiciona o JSON-LD, que não existe na fonte.
  const homePage = SEO_PAGES.find((p) => p.path === "/")!;
  writeRouteFile("index.html", injectMeta(baseHtml, homePage, true));

  for (const page of SEO_PAGES) {
    if (page.path === "/") continue;
    const relativePath = `${page.path.replace(/^\//, "")}.html`;
    writeRouteFile(relativePath, injectMeta(baseHtml, seoPageForBuild(page, ELEVE_IA_ENABLED, ELEVE_IA_PUBLIC), true));
  }

  for (const page of SEO_PRIVATE_PAGES) {
    const relativePath = `${page.path.replace(/^\//, "")}.html`;
    writeRouteFile(relativePath, injectMeta(baseHtml, page, false));
  }

  // 404.html na raiz de dist/ é o nome especial que o Cloudflare Pages serve
  // automaticamente, com status HTTP 404 real, para qualquer requisição que
  // não bate em nenhum arquivo estático nem em nenhuma regra de _redirects —
  // sem precisar de nenhuma regra explícita em public/_redirects para isso.
  writeRouteFile("404.html", injectMeta(baseHtml, SEO_NOT_FOUND, false));

  // sitemap.xml (Sprint 01H.1): gerado a partir de SEO_PAGES + a mesma flag
  // acima, sobrescrevendo a cópia estática que o Vite já colocou em dist/
  // (copiada de public/sitemap.xml). Nunca mais precisa de edição manual
  // para refletir o estado da Eleve IA.
  const sitemapPages = SEO_PAGES.map((page) => seoPageForBuild(page, ELEVE_IA_ENABLED, ELEVE_IA_PUBLIC));
  writeRouteFile("sitemap.xml", buildSitemapXml(sitemapPages));

  console.log("HTML estático por rota gerado com sucesso.");
}

main();
