/**
 * Dados estruturados (JSON-LD) do ElevePDF — só propriedades tecnicamente
 * verdadeiras hoje. Nenhuma nota, avaliação, contagem de usuários, preço,
 * organização jurídica ou prêmio: nada disso existe de verdade, então nada
 * disso entra aqui. Usado pelo script de build (`scripts/generateSeoHtml.ts`)
 * para injetar um `<script type="application/ld+json">` nas rotas públicas.
 */

import { absoluteUrl, PRODUCTION_ORIGIN } from "./pages";

export interface WebApplicationJsonLd {
  "@context": "https://schema.org";
  "@type": "WebApplication";
  name: string;
  url: string;
  description: string;
  applicationCategory: string;
  operatingSystem: string;
  browserRequirements: string;
  isAccessibleForFree: true;
}

/** JSON-LD `WebApplication` para uma rota pública específica — `description`
 * varia por rota (usa a mesma descrição de `shared/seo/pages.ts`), o resto é
 * fixo e verdadeiro para o ElevePDF como um todo. */
export function buildWebApplicationJsonLd(path: string, description: string): WebApplicationJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "ElevePDF",
    url: absoluteUrl(path),
    description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any (executado no navegador)",
    browserRequirements: "Requer JavaScript habilitado. Recomendado um navegador moderno (Chrome, Edge, Firefox ou Safari recentes).",
    isAccessibleForFree: true,
  };
}

export function jsonLdScriptTag(data: WebApplicationJsonLd): string {
  // JSON.stringify já escapa aspas; substituir "</" evita fechar a tag <script> prematuramente
  // caso algum texto futuro contenha esse literal.
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  return `<script type="application/ld+json">${json}</script>`;
}

export { PRODUCTION_ORIGIN };
