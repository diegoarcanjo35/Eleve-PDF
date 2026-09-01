import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFoundPage from "../NotFoundPage";

describe("NotFoundPage — 404 real, com links úteis", () => {
  it("informa claramente que a página não existe e oferece Home + as duas ferramentas", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/página não encontrada/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /voltar para a home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /compactar pdf/i })).toHaveAttribute("href", "/compactar-pdf");
    expect(screen.getByRole("link", { name: /dividir por tamanho/i })).toHaveAttribute(
      "href",
      "/dividir-pdf-por-tamanho",
    );
  });

  it("não exibe nenhum stack trace ou detalhe técnico de erro", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/at\s+\w+\s+\(/); // padrão de linha de stack trace JS
    expect(text).not.toMatch(/undefined is not/i);
  });
});
