import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TermsPage from "../TermsPage";

describe("TermsPage — renderiza e cobre os pontos obrigatórios", () => {
  it("renderiza o título e as seções principais", () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Termos de Uso", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/processamento local/i)).toBeInTheDocument();
    expect(screen.getByText(/preservar uma cópia do PDF original/i)).toBeInTheDocument();
    expect(screen.getByText(/redução mínima ou nenhuma redução/i)).toBeInTheDocument();
    expect(screen.getByText(/nunca cortando/i)).toBeInTheDocument();
    expect(screen.getByText(/proibido usar o ElevePDF/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "EleveSites" })).toHaveAttribute(
      "href",
      "https://elevesites.com.br/",
    );
  });

  it("não inventa CNPJ, razão social, endereço ou e-mail", () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/cnpj/i);
    expect(text).not.toMatch(/@elevepdf/i);
    expect(text).not.toMatch(/\bltda\b/i);
  });
});
