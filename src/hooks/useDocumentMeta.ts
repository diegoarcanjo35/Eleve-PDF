import { useEffect } from "react";

const PRODUCTION_ORIGIN = "https://elevepdf.elevesites.com.br";

/** Define título, descrição, canonical e robots por rota — sem dependências novas.
 * `robots` default é "index, follow"; rotas privadas (ex.: `/admin/analytics`) devem
 * passar "noindex, nofollow" explicitamente. */
export function useDocumentMeta(title: string, description: string, path = "/", robots = "index, follow") {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);

    let canonical = document.querySelector('link[rel="canonical"]');
    const previousCanonical = canonical?.getAttribute("href") ?? "";
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `${PRODUCTION_ORIGIN}${path}`);

    let robotsMeta = document.querySelector('meta[name="robots"]');
    const previousRobots = robotsMeta?.getAttribute("content") ?? "";
    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.setAttribute("content", robots);

    return () => {
      document.title = previousTitle;
      meta?.setAttribute("content", previousDescription);
      canonical?.setAttribute("href", previousCanonical);
      robotsMeta?.setAttribute("content", previousRobots);
    };
  }, [title, description, path, robots]);
}
