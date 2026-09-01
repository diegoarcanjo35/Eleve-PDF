import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CompressPage from "../CompressPage";

describe("CompressPage", () => {
  it("carrega a ferramenta de compactação funcional (upload, título, aviso local)", () => {
    render(
      <MemoryRouter>
        <CompressPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Compactar PDF" })).toBeInTheDocument();
    expect(screen.getByText(/arraste um pdf aqui/i)).toBeInTheDocument();
    expect(screen.getByText(/processado no seu dispositivo — nenhum arquivo/i)).toBeInTheDocument();
  });
});
