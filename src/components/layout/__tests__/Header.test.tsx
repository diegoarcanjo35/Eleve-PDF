import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Header } from "../Header";

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Header />} />
        <Route path="/compactar-pdf" element={<Header />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Header — menu mobile e navegação por teclado", () => {
  it("abre e fecha o menu mobile pelo botão", async () => {
    const user = userEvent.setup();
    renderHeader();

    expect(screen.queryByRole("dialog", { name: /menu de navegação/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /abrir menu/i }));
    expect(screen.getByRole("dialog", { name: /menu de navegação/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /fechar menu/i }));
    expect(screen.queryByRole("dialog", { name: /menu de navegação/i })).not.toBeInTheDocument();
  });

  it("fecha o menu mobile ao navegar por um link", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /abrir menu/i }));
    const dialog = screen.getByRole("dialog", { name: /menu de navegação/i });
    const homeLink = screen.getAllByRole("link", { name: "Home" }).find((el) => dialog.contains(el));
    expect(homeLink).toBeDefined();

    await user.click(homeLink!);
    expect(screen.queryByRole("dialog", { name: /menu de navegação/i })).not.toBeInTheDocument();
  });

  it("permanece navegável por teclado: Tab alcança o link Home e Enter ativa o menu", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.tab(); // logo (link para Home)
    await user.tab(); // primeiro item da navegação (Home)
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();

    const menuButton = screen.getByRole("button", { name: /abrir menu/i });
    menuButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: /menu de navegação/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /menu de navegação/i })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });
});
