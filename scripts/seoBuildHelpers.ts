/**
 * Lógica pura de SEO usada no pós-build (`generateSeoHtml.ts`) — extraída
 * para um módulo sem efeito colateral (sem `fs`, sem `main()` rodando ao
 * importar) para ser testável diretamente (Sprint 01H.1 — ver
 * `scripts/__tests__/seoBuildHelpers.test.ts`).
 */
import { absoluteUrl, type SeoPageMeta } from "../shared/seo/pages";

/**
 * Feature flag da Eleve IA no processo de build (Sprint 01H) — mesma
 * variável de ambiente que `src/featureFlags.ts` lê via `import.meta.env`
 * dentro do bundle do navegador; aqui é lida via `process.env` porque este
 * script roda em Node puro (`tsx`), fora do pipeline do Vite. Uma única
 * variável, duas formas de leitura conforme o runtime. Fail-closed: ausente
 * ou diferente de "true" = desligada. A consistência entre esta e a flag do
 * backend (`ELEVE_IA_ENABLED`) é garantida à parte, ANTES do build, por
 * `scripts/validateEleveIaFlag.ts` — não aqui.
 *
 * Parâmetro `env` só existe para permitir teste determinístico; em uso real
 * (CLI) sempre recebe `process.env`.
 */
export function isEleveIaEnabledForBuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VITE_ELEVE_IA_ENABLED === "true";
}

/**
 * Enquanto a Eleve IA estiver desligada, `/conversar-com-pdf` não deve ser
 * indexável nem apontar canonical — mesmo tratamento dado à 404
 * (`SEO_NOT_FOUND`). Não modifica `SEO_PAGES` (que descreve o estado
 * "ligado"), só a cópia usada para gerar o HTML estático e o sitemap desta
 * rota.
 */
export function seoPageForBuild(page: SeoPageMeta, eleveIaEnabled: boolean): SeoPageMeta {
  if (page.path !== "/conversar-com-pdf" || eleveIaEnabled) return page;
  return { ...page, robots: "noindex, nofollow", canonical: false };
}

/**
 * Sitemap gerado a partir da lista de páginas já ajustada por
 * `seoPageForBuild` (Sprint 01H.1) — nunca mais editado manualmente. Só
 * inclui rotas com `robots: "index, follow"`; `/conversar-com-pdf` some
 * automaticamente quando a Eleve IA está desligada, porque
 * `seoPageForBuild` já a marca como `noindex, nofollow` nesse caso.
 */
export function buildSitemapXml(pages: SeoPageMeta[]): string {
  const urls = pages
    .filter((page) => page.robots === "index, follow")
    .map((page) => `  <url>\n    <loc>${absoluteUrl(page.path)}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
