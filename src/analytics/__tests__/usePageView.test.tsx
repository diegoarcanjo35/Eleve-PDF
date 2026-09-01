import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { usePageView } from "../usePageView";
import { setConsent, __resetConsentForTests } from "../consent";
import { __resetSessionStateForTests } from "../session";

function Probe() {
  usePageView();
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate("/compactar-pdf")}>go-compress</button>
      <button onClick={() => navigate("/")}>go-home</button>
      <button onClick={() => navigate("/termos-de-uso")}>go-terms</button>
    </div>
  );
}

function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fetchCalls() {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
}

function lastEventBody(): { event: string; route_id?: string; session_id: string } {
  const calls = fetchCalls();
  const [, init] = calls[calls.length - 1] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe("Ciclo de page_view — consentimento, navegação SPA e revogação", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetConsentForTests();
    __resetSessionStateForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("sem escolha (unset): nenhum page_view é enviado", () => {
    renderApp();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aceitar na página atual dispara exatamente um page_view da rota atual, sem reload", () => {
    renderApp();
    expect(fetch).not.toHaveBeenCalled();

    act(() => {
      setConsent("accepted");
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = lastEventBody();
    expect(body.event).toBe("page_view");
    expect(body.route_id).toBe("home");
  });

  it("navegação SPA dispara um page_view por mudança real de pathname, sem duplicar em re-render", () => {
    const { getByText, rerender } = renderApp();
    act(() => setConsent("accepted"));
    expect(fetch).toHaveBeenCalledTimes(1); // page_view inicial da home

    act(() => {
      getByText("go-compress").click();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(lastEventBody().route_id).toBe("compactar-pdf");

    // Re-render sem mudança de rota não deve duplicar.
    rerender(
      <MemoryRouter initialEntries={["/compactar-pdf"]}>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("recusar nunca envia page_view", () => {
    renderApp();
    act(() => setConsent("declined"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("revogar consentimento interrompe eventos seguintes e limpa a sessão pseudônima", () => {
    renderApp();
    act(() => setConsent("accepted"));
    expect(fetch).toHaveBeenCalledTimes(1);
    const firstSessionId = lastEventBody().session_id;
    expect(sessionStorage.getItem("elevepdf.analytics.session_id")).toBe(firstSessionId);

    act(() => setConsent("declined"));
    expect(sessionStorage.getItem("elevepdf.analytics.session_id")).toBeNull();
    expect(sessionStorage.getItem("elevepdf.analytics.attribution")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1); // nenhum novo envio só por revogar
    expect(firstSessionId).toBeTruthy();
  });

  it("aceitar novamente após revogar inicia uma sessão nova e dispara um page_view da rota atual", () => {
    renderApp();
    act(() => setConsent("accepted"));
    const firstSessionId = lastEventBody().session_id;

    act(() => setConsent("declined"));
    act(() => setConsent("accepted"));

    expect(fetch).toHaveBeenCalledTimes(2);
    const secondBody = lastEventBody();
    expect(secondBody.event).toBe("page_view");
    expect(secondBody.route_id).toBe("home");
    expect(secondBody.session_id).not.toBe(firstSessionId);
  });

  it("já aceito ao entrar no site dispara exatamente um page_view inicial", () => {
    setConsent("accepted");
    renderApp();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lastEventBody().route_id).toBe("home");
  });

  it("/termos-de-uso: já aceito ao entrar gera exatamente um page_view com route_id termos-de-uso (Gate 1)", () => {
    setConsent("accepted");
    renderApp("/termos-de-uso");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lastEventBody().route_id).toBe("termos-de-uso");
  });

  it("/termos-de-uso: sem consentimento, nenhum evento é enviado (Gate 1)", () => {
    renderApp("/termos-de-uso");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("/termos-de-uso: aceitar consentimento já dentro da página gera o page_view esperado (Gate 1)", () => {
    renderApp("/termos-de-uso");
    expect(fetch).not.toHaveBeenCalled();

    act(() => setConsent("accepted"));

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = lastEventBody();
    expect(body.event).toBe("page_view");
    expect(body.route_id).toBe("termos-de-uso");
  });

  it("/termos-de-uso: navegação SPA até a página gera só o evento correto, sem duplicar (Gate 1)", () => {
    const { getByText } = renderApp("/");
    act(() => setConsent("accepted"));
    expect(fetch).toHaveBeenCalledTimes(1); // page_view inicial da home

    act(() => {
      getByText("go-terms").click();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(lastEventBody().route_id).toBe("termos-de-uso");

    // Clicar de novo no mesmo destino não deve gerar duplicata (mesma rota).
    act(() => {
      getByText("go-terms").click();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rota administrativa não gera page_view mesmo com consentimento aceito", () => {
    render(
      <MemoryRouter initialEntries={["/admin/analytics"]}>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    act(() => setConsent("accepted"));
    expect(fetch).not.toHaveBeenCalled();
  });
});
