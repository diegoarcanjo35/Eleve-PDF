import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Footer } from "../Footer";

describe("Footer — links institucionais e legais", () => {
  it("contém Diego Arcanjo Web Studio, EleveSites, Privacidade e Termos de Uso", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Diego Arcanjo Web Studio/)).toBeInTheDocument();

    const eleveSitesLink = screen.getByRole("link", { name: /conheça a elevesites/i });
    expect(eleveSitesLink).toHaveAttribute("href", "https://elevesites.com.br/");
    expect(eleveSitesLink).toHaveAttribute("target", "_blank");
    expect(eleveSitesLink).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.getByRole("link", { name: /privacidade e métricas/i })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    expect(screen.getByRole("link", { name: /termos de uso/i })).toHaveAttribute("href", "/termos-de-uso");
  });

  it("nunca linka para o painel administrativo", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: /admin/i })).not.toBeInTheDocument();
    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toMatch(/\/admin/);
    }
  });
});
