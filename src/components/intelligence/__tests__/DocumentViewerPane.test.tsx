import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentViewerPane } from "../DocumentViewerPane";

describe("DocumentViewerPane", () => {
  beforeEach(() => {
    // jsdom não implementa createObjectURL/revokeObjectURL nativamente.
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function bytesOf(text = "conteudo"): ArrayBuffer {
    return new TextEncoder().encode(text).buffer;
  }

  it("12. navega para a página solicitada via fragmento #page=N do iframe", () => {
    render(
      <DocumentViewerPane
        fileBytes={bytesOf()}
        fileName="documento.pdf"
        pageCount={10}
        currentPage={4}
        onPageChange={() => {}}
      />,
    );
    const iframe = screen.getByTitle(/visualização de documento\.pdf/i) as HTMLIFrameElement;
    expect(iframe.src).toContain("#page=4");
  });

  it("botão próxima página chama onPageChange com a página seguinte", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <DocumentViewerPane
        fileBytes={bytesOf()}
        fileName="documento.pdf"
        pageCount={10}
        currentPage={4}
        onPageChange={onPageChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /próxima página/i }));
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it("desabilita 'página anterior' na primeira página e 'próxima' na última", () => {
    const { rerender } = render(
      <DocumentViewerPane fileBytes={bytesOf()} fileName="d.pdf" pageCount={3} currentPage={1} onPageChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /página anterior/i })).toBeDisabled();

    rerender(<DocumentViewerPane fileBytes={bytesOf()} fileName="d.pdf" pageCount={3} currentPage={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /próxima página/i })).toBeDisabled();
  });

  it("mostra o indicador 'Página X de Y'", () => {
    render(<DocumentViewerPane fileBytes={bytesOf()} fileName="d.pdf" pageCount={12} currentPage={7} onPageChange={() => {}} />);
    expect(screen.getByText("Página 7 de 12")).toBeInTheDocument();
  });
});
