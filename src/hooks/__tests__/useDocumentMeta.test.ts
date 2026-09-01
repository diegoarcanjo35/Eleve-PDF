import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentMeta } from "../useDocumentMeta";
import { findSeoPage, SEO_NOT_FOUND, OG_IMAGE_URL } from "@shared/seo/pages";

describe("useDocumentMeta — metadados por rota", () => {
  it("usa 'index, follow' e emite canonical/OG em uma rota pública", () => {
    const page = findSeoPage("/compactar-pdf")!;
    renderHook(() => useDocumentMeta(page));

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("index, follow");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://elevepdf.elevesites.com.br/compactar-pdf",
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(page.title);
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(OG_IMAGE_URL);
    expect(document.querySelector('meta[property="og:image:width"]')?.getAttribute("content")).toBe("1200");
    expect(document.querySelector('meta[property="og:image:height"]')?.getAttribute("content")).toBe("630");
    expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe("pt_BR");
    expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe(
      "summary_large_image",
    );
  });

  it("usa 'noindex, nofollow' na rota administrativa", () => {
    const page = findSeoPage("/admin/analytics")!;
    renderHook(() => useDocumentMeta(page));
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });

  it("a página 404 é noindex,nofollow e nunca emite um canonical indexável", () => {
    renderHook(() => useDocumentMeta(SEO_NOT_FOUND));
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
