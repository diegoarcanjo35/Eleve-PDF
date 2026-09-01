import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../client";
import { setConsent, __resetConsentForTests } from "../consent";
import { __resetSessionStateForTests } from "../session";

describe("track — respeita o consentimento antes de qualquer coisa", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetSessionStateForTests();
    __resetConsentForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("não envia nenhum evento antes de qualquer consentimento (estado inicial 'unset')", () => {
    track("page_view", { route_id: "home" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("não envia nenhum evento depois de recusado", () => {
    setConsent("declined");
    track("page_view", { route_id: "home" });
    track("tool_open", { tool_id: "compactar-pdf" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("envia eventos depois de aceito", () => {
    setConsent("accepted");
    track("page_view", { route_id: "home" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/analytics/event");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.event).toBe("page_view");
    expect(body.session_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("nunca lança mesmo se fetch falhar — Analytics é best-effort e não pode derrubar a ferramenta", async () => {
    setConsent("accepted");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.reject(new Error("network down"))),
    );
    expect(() => track("processing_error", { tool_id: "compactar-pdf", outcome: "error" })).not.toThrow();
  });

  it("funciona como no-op completo quando desativado — nenhuma chamada de rede, nenhuma exceção", () => {
    // "desativado" aqui = consentimento nunca concedido (comportamento padrão de fábrica).
    expect(() => {
      track("page_view", { route_id: "home" });
      track("download_result", { tool_id: "dividir-pdf-por-tamanho" });
    }).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
