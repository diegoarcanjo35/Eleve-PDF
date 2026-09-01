import { useEffect } from "react";
import {
  absoluteUrl,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_URL,
  OG_IMAGE_WIDTH,
  type SeoPageMeta,
} from "@shared/seo/pages";

type ManagedTag = { el: Element; attr: string; previous: string };

function upsertMeta(selector: string, create: () => Element, attr: string, value: string, tags: ManagedTag[]) {
  let el = document.querySelector(selector);
  const previous = el?.getAttribute(attr) ?? "";
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
  tags.push({ el, attr, previous });
}

/**
 * Aplica os metadados de uma rota (`shared/seo/pages.ts`) ao `<head>` em
 * runtime — cobre a navegação SPA (troca de rota sem reload completo). Não
 * substitui a geração estática por rota do build (`scripts/generateSeoHtml.ts`),
 * que é o que garante que crawlers que só leem o HTML inicial (WhatsApp,
 * alguns indexadores) já veem os metadados corretos antes de qualquer JS
 * rodar — as duas fontes leem os mesmos dados de `shared/seo/pages.ts`, nunca
 * duplicados como texto solto em dois lugares.
 */
export function useDocumentMeta(page: SeoPageMeta) {
  const { title, description, path, robots, social, canonical: hasCanonical } = page;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const tags: ManagedTag[] = [];
    const meta = (name: string) => {
      const el = document.createElement("meta");
      el.setAttribute("name", name);
      return el;
    };
    const metaProp = (property: string) => {
      const el = document.createElement("meta");
      el.setAttribute("property", property);
      return el;
    };

    upsertMeta('meta[name="description"]', () => meta("description"), "content", description, tags);
    upsertMeta('meta[name="robots"]', () => meta("robots"), "content", robots, tags);

    let canonical: Element | null = null;
    let previousCanonical = "";
    if (hasCanonical) {
      canonical = document.querySelector('link[rel="canonical"]');
      previousCanonical = canonical?.getAttribute("href") ?? "";
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        document.head.appendChild(canonical);
      }
      canonical.setAttribute("href", absoluteUrl(path));
    } else {
      // A 404 (e qualquer outra rota marcada `canonical: false`) nunca deve
      // apontar um canonical indexável — remove um eventual canonical
      // deixado por uma rota anterior visitada na mesma sessão SPA.
      document.querySelector('link[rel="canonical"]')?.remove();
    }

    if (social) {
      const url = absoluteUrl(path);
      upsertMeta('meta[property="og:title"]', () => metaProp("og:title"), "content", title, tags);
      upsertMeta('meta[property="og:description"]', () => metaProp("og:description"), "content", description, tags);
      upsertMeta('meta[property="og:url"]', () => metaProp("og:url"), "content", url, tags);
      upsertMeta('meta[property="og:type"]', () => metaProp("og:type"), "content", "website", tags);
      upsertMeta('meta[property="og:image"]', () => metaProp("og:image"), "content", OG_IMAGE_URL, tags);
      upsertMeta(
        'meta[property="og:image:width"]',
        () => metaProp("og:image:width"),
        "content",
        String(OG_IMAGE_WIDTH),
        tags,
      );
      upsertMeta(
        'meta[property="og:image:height"]',
        () => metaProp("og:image:height"),
        "content",
        String(OG_IMAGE_HEIGHT),
        tags,
      );
      upsertMeta('meta[property="og:image:alt"]', () => metaProp("og:image:alt"), "content", OG_IMAGE_ALT, tags);
      upsertMeta('meta[property="og:locale"]', () => metaProp("og:locale"), "content", "pt_BR", tags);
      upsertMeta('meta[name="twitter:card"]', () => meta("twitter:card"), "content", "summary_large_image", tags);
      upsertMeta('meta[name="twitter:title"]', () => meta("twitter:title"), "content", title, tags);
      upsertMeta(
        'meta[name="twitter:description"]',
        () => meta("twitter:description"),
        "content",
        description,
        tags,
      );
      upsertMeta('meta[name="twitter:image"]', () => meta("twitter:image"), "content", OG_IMAGE_URL, tags);
    }

    return () => {
      document.title = previousTitle;
      canonical?.setAttribute("href", previousCanonical);
      tags.forEach(({ el, attr, previous }) => el.setAttribute(attr, previous));
    };
  }, [title, description, path, robots, social, hasCanonical]);
}
