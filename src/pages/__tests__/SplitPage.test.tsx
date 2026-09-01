import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SplitPage from "../SplitPage";

describe("SplitPage", () => {
  it("carrega a ferramenta de divisão funcional (upload, título, aviso local)", () => {
    render(
      <MemoryRouter>
        <SplitPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Dividir PDF por tamanho" })).toBeInTheDocument();
    expect(screen.getByText(/arraste um pdf aqui/i)).toBeInTheDocument();
    expect(screen.getByText(/processado no seu dispositivo — nenhum arquivo/i)).toBeInTheDocument();
  });
});
