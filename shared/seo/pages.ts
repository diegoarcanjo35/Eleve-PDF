/**
 * Fonte única de verdade dos metadados de SEO do ElevePDF — usada tanto pelo
 * cliente (`useDocumentMeta`, atualização em runtime) quanto pelo script de
 * build (`scripts/generateSeoHtml.ts`, HTML estático por rota). Mudar um
 * título/descrição aqui muda os dois lugares ao mesmo tempo — nunca duplicar
 * esses textos em outro arquivo.
 *
 * Puro dado — sem `window`/`document`, sem I/O — seguro de importar em
 * qualquer runtime (navegador, Node no build, Cloudflare Functions).
 */

export const PRODUCTION_ORIGIN = "https://elevepdf.elevesites.com.br";

/** Caminho público da imagem Open Graph (gerada por `scripts/generateOgImage.ts`). */
export const OG_IMAGE_PATH = "/og-elevepdf.png";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = "ElevePDF — compacte e divida PDFs direto no navegador";

export interface SeoPageMeta {
  /** Caminho da rota, ex.: "/", "/compactar-pdf". */
  path: string;
  title: string;
  description: string;
  robots: "index, follow" | "noindex, nofollow";
  /** Se falso, a rota não recebe OG/Twitter (ex.: painel administrativo). */
  social: boolean;
  /** Se falso, nenhuma tag `<link rel="canonical">` é emitida — usado só pela
   * página 404, que não deve apontar um canonical indexável para si mesma. */
  canonical: boolean;
}

/**
 * As cinco rotas públicas indexáveis, na ordem em que também aparecem no
 * `sitemap.xml` (ver `scripts/generateSitemap` — não existe script separado,
 * o sitemap é um arquivo estático revisado manualmente a partir desta lista).
 */
export const SEO_PAGES: SeoPageMeta[] = [
  {
    path: "/",
    title: "ElevePDF — Ferramentas gratuitas para PDF, direto no navegador",
    description:
      "Compacte e divida arquivos PDF gratuitamente, processados no seu próprio navegador — sem enviar documentos para servidores. Privacidade por padrão.",
    robots: "index, follow",
    social: true,
    canonical: true,
  },
  {
    path: "/compactar-pdf",
    title: "Compactar PDF grátis, direto no navegador — ElevePDF",
    description:
      "Reduza o tamanho do seu PDF gratuitamente, processado no seu navegador, sem enviar o arquivo a servidores. A redução depende do conteúdo de cada PDF.",
    robots: "index, follow",
    social: true,
    canonical: true,
  },
  {
    path: "/dividir-pdf-por-tamanho",
    title: "Dividir PDF por tamanho (MB) — ElevePDF",
    description:
      "Separe um PDF grande em partes dentro de um limite de tamanho que você escolhe, sem cortar páginas ao meio, direto no navegador. Uma página muito grande pode gerar uma parte acima do limite-alvo.",
    robots: "index, follow",
    social: true,
    canonical: true,
  },
  {
    path: "/juntar-pdfs",
    title: "Juntar PDFs grátis, direto no navegador — ElevePDF",
    description:
      "Combine dois ou mais arquivos PDF em um único documento, na ordem que você escolher, processado no seu navegador, sem enviar os arquivos a servidores.",
    robots: "index, follow",
    social: true,
    canonical: true,
  },
  {
    path: "/conversar-com-pdf",
    title: "Converse com seu PDF com IA — Eleve IA | ElevePDF",
    description:
      "Envie um PDF e faça perguntas sobre o conteúdo dele com a Eleve IA. Respostas fundamentadas, com as páginas de origem indicadas.",
    robots: "index, follow",
    social: true,
    canonical: true,
  },
  {
    path: "/privacidade",
    title: "Privacidade e métricas — ElevePDF",
    description:
      "Como o ElevePDF processa seus PDFs localmente e quais métricas pseudônimas e opcionais são usadas, sempre com consentimento explícito.",
    robots: "index, follow",
    social: true,
    canonical: true,
  },
  {
    path: "/termos-de-uso",
    title: "Termos de Uso — ElevePDF",
    description:
      "Termos de uso do ElevePDF: processamento local dos arquivos, responsabilidade do usuário e limites reais da compactação e da divisão.",
    robots: "index, follow",
    social: true,
    canonical: true,
  },
];

/** Rotas que existem e precisam de metadados corretos, mas não são
 * indexáveis nem recebem imagem social — hoje, só o painel administrativo. */
export const SEO_PRIVATE_PAGES: SeoPageMeta[] = [
  {
    path: "/admin/analytics",
    title: "Painel de métricas — ElevePDF",
    description: "Painel privado de métricas do ElevePDF.",
    robots: "noindex, nofollow",
    social: false,
    canonical: true,
  },
];

export const SEO_NOT_FOUND: SeoPageMeta = {
  path: "/404",
  title: "Página não encontrada — ElevePDF",
  description: "A página que você tentou acessar não existe ou foi movida.",
  robots: "noindex, nofollow",
  social: false,
  canonical: false,
};

export function findSeoPage(path: string): SeoPageMeta | undefined {
  return SEO_PAGES.find((page) => page.path === path) ?? SEO_PRIVATE_PAGES.find((page) => page.path === path);
}

/** URL absoluta de um caminho de rota — "/" vira a origem com barra final;
 * qualquer outra rota vira `${origem}${caminho}`, sem barra final. */
export function absoluteUrl(path: string): string {
  return path === "/" ? `${PRODUCTION_ORIGIN}/` : `${PRODUCTION_ORIGIN}${path}`;
}

export const OG_IMAGE_URL = `${PRODUCTION_ORIGIN}${OG_IMAGE_PATH}`;
