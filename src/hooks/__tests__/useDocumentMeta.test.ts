import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentMeta } from "../useDocumentMeta";

describe("useDocumentMeta — robots por rota", () => {
  it("usa 'index, follow' por padrão em rotas públicas", () => {
    renderHook(() => useDocumentMeta("Título", "Descrição", "/compactar-pdf"));
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("index, follow");
  });

  it("usa 'noindex, nofollow' quando explicitamente passado (rota administrativa)", () => {
    renderHook(() =>
      useDocumentMeta("Painel", "Painel privado", "/admin/analytics", "noindex, nofollow"),
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, nofollow",
    );
  });
});
