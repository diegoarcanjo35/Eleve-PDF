/**
 * Comprovação obrigatória (Fase 2.2, Parte C): depois do build, inspeciona
 * diretamente os HTMLs estáticos gerados em `dist/` e falha (`exitCode = 1`)
 * se algum metadado obrigatório estiver ausente, ou se algum canonical/OG
 * apontar para localhost/preview em vez do domínio oficial.
 *
 * Não executa JavaScript nem abre um navegador — lê o HTML bruto como texto,
 * exatamente como um crawler que não roda JS o leria.
 *
 * Uso: `npx tsx scripts/verifySeoHtml.ts` (depois de `npm run build`).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEO_PAGES, SEO_PRIVATE_PAGES, SEO_NOT_FOUND } from "../shared/seo/pages";

const DIST_DIR = resolve("dist");
const FORBIDDEN_PATTERNS = [/localhost/i, /127\.0\.0\.1/, /\.pages\.dev/i, /0\.0\.0\.0/];

let failures = 0;

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function ok(message: string) {
  console.log(`✓ ${message}`);
}

function readRoute(relativePath: string): string | null {
  const target = resolve(DIST_DIR, relativePath);
  if (!existsSync(target)) return null;
  return readFileSync(target, "utf-8");
}

function checkNoForbiddenDomains(html: string, label: string) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) {
      fail(`${label}: contém um domínio proibido (${pattern})`);
      return;
    }
  }
  ok(`${label}: nenhum domínio de localhost/preview`);
}

function checkPublicPage(relativePath: string, label: string, page: (typeof SEO_PAGES)[number]) {
  const html = readRoute(relativePath);
  if (!html) {
    fail(`${label}: arquivo dist/${relativePath} não existe`);
    return;
  }
  const required: Array<[string, RegExp]> = [
    ["<title>", new RegExp(`<title>${escapeRegex(page.title)}</title>`)],
    ["meta description", new RegExp(`name="description" content="${escapeRegex(page.description)}"`)],
    ["canonical absoluto", /<link rel="canonical" href="https:\/\/elevepdf\.elevesites\.com\.br[^"]*" \/>/],
    ["meta robots", new RegExp(`name="robots" content="${page.robots}"`)],
    ["og:title", /property="og:title"/],
    ["og:description", /property="og:description"/],
    ["og:url", /property="og:url"/],
    ["og:type", /property="og:type"/],
    ["og:image", /property="og:image" content="https:\/\/elevepdf\.elevesites\.com\.br\/og-elevepdf\.png"/],
    ["og:image:width", /property="og:image:width" content="1200"/],
    ["og:image:height", /property="og:image:height" content="630"/],
    ["og:image:alt", /property="og:image:alt"/],
    ["og:locale", /property="og:locale" content="pt_BR"/],
    ["twitter:card", /name="twitter:card" content="summary_large_image"/],
    ["twitter:title", /name="twitter:title"/],
    ["twitter:description", /name="twitter:description"/],
    ["twitter:image", /name="twitter:image"/],
    ["lang pt-BR", /<html lang="pt-BR">/],
    ["JSON-LD", /<script type="application\/ld\+json">/],
  ];
  for (const [name, pattern] of required) {
    if (!pattern.test(html)) fail(`${label}: falta ${name}`);
  }
  if (required.every(([, pattern]) => pattern.test(html))) ok(`${label}: todos os metadados presentes no HTML estático`);
  checkNoForbiddenDomains(html, label);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main() {
  if (!existsSync(DIST_DIR)) {
    console.error("dist/ não encontrado — rode `npm run build` antes deste script.");
    process.exitCode = 1;
    return;
  }

  console.log("Verificando HTML estático gerado em dist/...\n");

  checkPublicPage("index.html", "/", SEO_PAGES[0]!);
  checkPublicPage("compactar-pdf.html", "/compactar-pdf", SEO_PAGES[1]!);
  checkPublicPage("dividir-pdf-por-tamanho.html", "/dividir-pdf-por-tamanho", SEO_PAGES[2]!);
  checkPublicPage("privacidade.html", "/privacidade", SEO_PAGES[3]!);
  checkPublicPage("termos-de-uso.html", "/termos-de-uso", SEO_PAGES[4]!);

  const adminHtml = readRoute("admin/analytics.html");
  if (!adminHtml) {
    fail("/admin/analytics: arquivo dist/admin/analytics.html não existe");
  } else {
    if (!/name="robots" content="noindex, nofollow"/.test(adminHtml)) {
      fail("/admin/analytics: robots não é noindex, nofollow");
    } else {
      ok("/admin/analytics: robots é noindex, nofollow");
    }
    checkNoForbiddenDomains(adminHtml, "/admin/analytics");
  }

  const notFoundHtml = readRoute("404.html");
  if (!notFoundHtml) {
    fail("404: dist/404.html não existe");
  } else {
    if (!/name="robots" content="noindex, nofollow"/.test(notFoundHtml)) {
      fail("404: robots não é noindex, nofollow");
    } else {
      ok("404: robots é noindex, nofollow");
    }
    if (/<link rel="canonical"/.test(notFoundHtml)) {
      fail("404: não deveria ter nenhum <link rel=canonical>");
    } else {
      ok("404: sem canonical indexável");
    }
    checkNoForbiddenDomains(notFoundHtml, "404");
  }

  console.log(`\n${SEO_PAGES.length} rotas públicas + ${SEO_PRIVATE_PAGES.length} rota privada + 404 verificadas.`);
  console.log(`404 esperado: "${SEO_NOT_FOUND.title}"`);

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`);
    process.exitCode = 1;
  } else {
    console.log("\nTudo certo — HTML estático renderizável por rota confirmado.");
  }
}

main();
