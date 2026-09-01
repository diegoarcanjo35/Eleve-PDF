import { describe, expect, it } from "vitest";
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
      </Routes>
    </MemoryRouter>,
  );
}

describe("Home", () => {
  it("mostra as duas ferramentas disponíveis, com status e rota corretos", () => {
    renderHome();
    const availableSection = screen.getByRole("heading", { name: "Comece por aqui" }).closest("section")!;
    const compress = within(availableSection).getByRole("link", { name: /compactar pdf — disponível/i });
    const split = within(availableSection).getByRole("link", { name: /dividir por tamanho — disponível/i });
    expect(compress).toHaveAttribute("href", "/compactar-pdf");
    expect(split).toHaveAttribute("href", "/dividir-pdf-por-tamanho");
  });

  it("navega para a rota correta ao clicar em um cartão disponível", async () => {
    const user = userEvent.setup();
    renderHome();
    const availableSection = screen.getByRole("heading", { name: "Comece por aqui" }).closest("section")!;
    await user.click(within(availableSection).getByRole("link", { name: /compactar pdf — disponível/i }));
    expect(await screen.findByText("Página de compactar")).toBeInTheDocument();
  });

  it("cartões 'Em breve' não são links nem acionáveis", () => {
    renderHome();
    const comingSoonTitle = screen.getByRole("heading", { name: "Juntar PDFs" });
    const card = comingSoonTitle.closest(".tool-card");
    expect(card).not.toBeNull();
    expect(card?.tagName).toBe("DIV");
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card?.querySelector("a")).toBeNull();
  });
});
