import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Home from "../Home";

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/compactar-pdf" element={<div>Página de compactar</div>} />
        <Route path="/dividir-pdf-por-tamanho" element={<div>Página de dividir</div>} />
        <Route path="/juntar-pdfs" element={<div>Página de juntar</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Home", () => {
  it("mostra as três ferramentas disponíveis, com status e rota corretos (Fase 3.1: Juntar PDFs saiu de 'Em breve')", () => {
    renderHome();
    const availableSection = screen.getByRole("heading", { name: "Comece por aqui" }).closest("section")!;
    const compress = within(availableSection).getByRole("link", { name: /compactar pdf — disponível/i });
    const split = within(availableSection).getByRole("link", { name: /dividir por tamanho — disponível/i });
    const merge = within(availableSection).getByRole("link", { name: /juntar pdfs — disponível/i });
    expect(compress).toHaveAttribute("href", "/compactar-pdf");
    expect(split).toHaveAttribute("href", "/dividir-pdf-por-tamanho");
    expect(merge).toHaveAttribute("href", "/juntar-pdfs");
  });

  it("navega para a rota correta ao clicar em um cartão disponível", async () => {
    const user = userEvent.setup();
    renderHome();
    const availableSection = screen.getByRole("heading", { name: "Comece por aqui" }).closest("section")!;
    await user.click(within(availableSection).getByRole("link", { name: /compactar pdf — disponível/i }));
    expect(await screen.findByText("Página de compactar")).toBeInTheDocument();
  });

  it("navega para /juntar-pdfs ao clicar no cartão de Juntar PDFs", async () => {
    const user = userEvent.setup();
    renderHome();
    const availableSection = screen.getByRole("heading", { name: "Comece por aqui" }).closest("section")!;
    await user.click(within(availableSection).getByRole("link", { name: /juntar pdfs — disponível/i }));
    expect(await screen.findByText("Página de juntar")).toBeInTheDocument();
  });

  it("Sprint 01H — Eleve IA desligada por padrão: CTA/promo não aparece na Home", () => {
    renderHome();
    expect(
      screen.queryByRole("heading", { name: /converse com seu pdf usando a eleve ia/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /conversar com um pdf/i })).not.toBeInTheDocument();
  });

  it("cartões 'Em breve' não são links nem acionáveis", () => {
    renderHome();
    const comingSoonTitle = screen.getByRole("heading", { name: "Organizar páginas" });
    const card = comingSoonTitle.closest(".tool-card");
    expect(card).not.toBeNull();
    expect(card?.tagName).toBe("DIV");
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card?.querySelector("a")).toBeNull();
  });
});

describe("Home — modo piloto/público (Sprint 01P)", () => {
  afterEach(() => {
    vi.doUnmock("@/featureFlags");
    vi.resetModules();
  });

  it("ligada mas NÃO pública (piloto fechado): CTA continua ausente da Home", async () => {
    vi.resetModules();
    vi.doMock("@/featureFlags", () => ({ ELEVE_IA_ENABLED: true, ELEVE_IA_PUBLIC: false }));
    const { default: HomePiloto } = await import("../Home");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomePiloto />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("heading", { name: /converse com seu pdf usando a eleve ia/i }),
    ).not.toBeInTheDocument();
  });

  it("ligada E pública: CTA aparece na Home", async () => {
    vi.resetModules();
    vi.doMock("@/featureFlags", () => ({ ELEVE_IA_ENABLED: true, ELEVE_IA_PUBLIC: true }));
    const { default: HomePublica } = await import("../Home");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomePublica />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /converse com seu pdf usando a eleve ia/i }),
    ).toBeInTheDocument();
  });
});
