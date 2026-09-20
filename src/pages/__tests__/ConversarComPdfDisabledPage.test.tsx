import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ConversarComPdfDisabledPage from "../ConversarComPdfDisabledPage";

function renderDisabledPage() {
  return render(
    <MemoryRouter>
      <ConversarComPdfDisabledPage />
    </MemoryRouter>,
  );
}

describe("ConversarComPdfDisabledPage (Sprint 01H — Eleve IA desligada)", () => {
  it("1. mostra mensagem deliberada de indisponibilidade, nunca uma tela quebrada", () => {
    renderDisabledPage();
    expect(screen.getByRole("heading", { name: "Converse com seu PDF" })).toBeInTheDocument();
    expect(screen.getByText(/temporariamente indisponível/i)).toBeInTheDocument();
  });

  it("2. nunca apresenta upload de arquivo (nenhuma sessão pode começar)", () => {
    renderDisabledPage();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("3. nunca apresenta chat funcional (nenhum campo de pergunta)", () => {
    renderDisabledPage();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar/i })).not.toBeInTheDocument();
  });

  it("4. oferece um caminho controlado de volta para a Home", () => {
    renderDisabledPage();
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/");
  });

  it("5. define meta noindex — a funcionalidade indisponível não deve ser indexada", () => {
    renderDisabledPage();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });
});
