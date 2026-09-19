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

  it("1. carrega inicialmente na página correta via fragmento #page=N do iframe", () => {
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

  it("2. mudar currentPage (mesmo documento) altera o destino (src) do iframe", () => {
    // MESMA referência de bytes nas duas renderizações — é exatamente o
    // cenário real (documento não muda, só a página corrente).
    const sameBytes = bytesOf();
    const { rerender, container } = render(
      <DocumentViewerPane fileBytes={sameBytes} fileName="documento.pdf" pageCount={10} currentPage={4} onPageChange={() => {}} />,
    );
    expect((container.querySelector("iframe") as HTMLIFrameElement).src).toContain("#page=4");

    rerender(
      <DocumentViewerPane fileBytes={sameBytes} fileName="documento.pdf" pageCount={10} currentPage={7} onPageChange={() => {}} />,
    );
    expect((container.querySelector("iframe") as HTMLIFrameElement).src).toContain("#page=7");
  });

  it("3. o iframe é efetivamente REMONTADO (novo nó DOM) quando a página muda, mesmo documento — não só um atributo atualizado no mesmo nó (Sprint 01F.2: o visualizador nativo do Chromium ignora troca de src só de fragmento num iframe já carregado)", () => {
    const sameBytes = bytesOf();
    const { rerender, container } = render(
      <DocumentViewerPane fileBytes={sameBytes} fileName="documento.pdf" pageCount={10} currentPage={4} onPageChange={() => {}} />,
    );
    const firstIframe = container.querySelector("iframe") as HTMLIFrameElement;
    // Marca o nó DOM atual — um remount de verdade cria um elemento novo,
    // que nunca carrega essa marca; uma atualização in-place do mesmo nó
    // (o bug original) preservaria a marca.
    firstIframe.dataset.testMarker = "instancia-original";

    rerender(
      <DocumentViewerPane fileBytes={sameBytes} fileName="documento.pdf" pageCount={10} currentPage={5} onPageChange={() => {}} />,
    );

    const secondIframe = container.querySelector("iframe") as HTMLIFrameElement;
    expect(secondIframe).not.toBe(firstIframe);
    expect(secondIframe.dataset.testMarker).toBeUndefined();
    expect(secondIframe.src).toContain("#page=5");
  });

  it("11. trocar de página NUNCA cria uma nova Blob URL — só o iframe é remontado, o blob é o mesmo", () => {
    const createObjectURL = vi.fn(() => "blob:fake-url");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    // MESMA referência de ArrayBuffer em todas as rerenders — como acontece
    // de verdade em produção (`viewerBytes` só muda quando um NOVO documento
    // é carregado, nunca quando só a página corrente muda).
    const sameBytes = bytesOf();

    const { rerender } = render(
      <DocumentViewerPane fileBytes={sameBytes} fileName="documento.pdf" pageCount={10} currentPage={1} onPageChange={() => {}} />,
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    for (const page of [2, 3, 4, 1]) {
      rerender(
        <DocumentViewerPane fileBytes={sameBytes} fileName="documento.pdf" pageCount={10} currentPage={page} onPageChange={() => {}} />,
      );
    }

    // Mesmas bytes (mesmo documento) em todas as rerenders acima — o Blob
    // nunca deveria ser recriado só porque a página mudou.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
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
