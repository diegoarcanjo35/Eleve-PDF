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
 * `VITE_ELEVE_IA_PUBLIC` (Sprint 01P — preparação do piloto) — separa
 * conceitualmente "funcionalidade tecnicamente habilitada"
 * (`VITE_ELEVE_IA_ENABLED`) de "divulgação pública/indexação". Um piloto
 * fechado (convidados via Cloudflare Access) precisa da rota FUNCIONAL sem
 * estar promovida na Home nem indexável — daí a flag separada, em vez de
 * reaproveitar `VITE_ELEVE_IA_ENABLED` para as duas coisas.
 *
 * Ausente/diferente de "true" = não pública (mais restritivo por padrão,
 * mesmo padrão fail-closed de `isEleveIaEnabledForBuild`). Sem par no
 * backend de propósito — é uma decisão de SEO/promoção de UI, nunca uma
 * barreira de segurança (essa continua sendo `ELEVE_IA_ENABLED` do backend
 * + Cloudflare Access, ver `_shared/pilotAccess.ts`).
 */
export function isEleveIaPublicForBuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VITE_ELEVE_IA_PUBLIC === "true";
}

/**
 * Enquanto a Eleve IA estiver desligada OU ligada mas não pública (modo
 * piloto fechado, Sprint 01P), `/conversar-com-pdf` não deve ser indexável
 * nem apontar canonical — mesmo tratamento dado à 404 (`SEO_NOT_FOUND`).
 * Não modifica `SEO_PAGES` (que descreve o estado "ligado E público"), só a
 * cópia usada para gerar o HTML estático e o sitemap desta rota.
 *
 * `eleveIaPublic` tem default `true` de propósito — preserva exatamente o
 * comportamento anterior a esta sprint para quem chama com só 2 argumentos
 * (ligada = totalmente pública, como sempre foi até aqui).
 */
export function seoPageForBuild(page: SeoPageMeta, eleveIaEnabled: boolean, eleveIaPublic: boolean = true): SeoPageMeta {
  if (page.path !== "/conversar-com-pdf" || (eleveIaEnabled && eleveIaPublic)) return page;
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
