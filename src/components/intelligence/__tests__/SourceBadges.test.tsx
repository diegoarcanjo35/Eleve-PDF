import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceBadges } from "../SourceBadges";

const trackMock = vi.fn();
vi.mock("@/analytics/client", () => ({ track: (...args: unknown[]) => trackMock(...args) }));

describe("SourceBadges", () => {
  it("11. mostra as páginas reais devolvidas pelo backend, nunca inventadas", () => {
    render(
      <SourceBadges
        evidence={[
          { evidenceId: "E1", chunkId: "s:0", pages: [3], startPage: 3, endPage: 3 },
          { evidenceId: "E2", chunkId: "s:1", pages: [7, 8], startPage: 7, endPage: 8 },
        ]}
        onNavigateToPage={() => {}}
      />,
    );
    expect(screen.getByText("Página 3")).toBeInTheDocument();
    expect(screen.getByText("Páginas 7–8")).toBeInTheDocument();
  });

  it("12. clicar numa fonte navega para a página inicial daquela evidência", async () => {
    const user = userEvent.setup();
    const onNavigateToPage = vi.fn();
    render(
      <SourceBadges
        evidence={[{ evidenceId: "E1", chunkId: "s:0", pages: [5], startPage: 5, endPage: 5 }]}
        onNavigateToPage={onNavigateToPage}
      />,
    );
    await user.click(screen.getByText("Página 5"));
    expect(onNavigateToPage).toHaveBeenCalledWith(5);
  });

  it("não renderiza nada quando não há evidência", () => {
    const { container } = render(<SourceBadges evidence={[]} onNavigateToPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("18. com relevantPage presente, o rótulo mostra a página específica E a amplitude real, e o clique navega para relevantPage", async () => {
    const user = userEvent.setup();
    const onNavigateToPage = vi.fn();
    render(
      <SourceBadges
        evidence={[{ evidenceId: "E1", chunkId: "s:0", pages: [1, 2, 3, 4], startPage: 1, endPage: 4, relevantPage: 3 }]}
        onNavigateToPage={onNavigateToPage}
      />,
    );
    const badge = screen.getByText("Página 3 · fonte: páginas 1–4");
    expect(badge).toBeInTheDocument();
    await user.click(badge);
    expect(onNavigateToPage).toHaveBeenCalledWith(3);
  });

  it("19. sem relevantPage (ambíguo ou chunk legado), comportamento é o de antes: rótulo só com a amplitude, clique navega para startPage", async () => {
    const user = userEvent.setup();
    const onNavigateToPage = vi.fn();
    render(
      <SourceBadges
        evidence={[{ evidenceId: "E1", chunkId: "s:0", pages: [1, 2, 3, 4], startPage: 1, endPage: 4 }]}
        onNavigateToPage={onNavigateToPage}
      />,
    );
    const badge = screen.getByText("Páginas 1–4");
    expect(badge).toBeInTheDocument();
    expect(screen.queryByText(/fonte:/)).not.toBeInTheDocument();
    await user.click(badge);
    expect(onNavigateToPage).toHaveBeenCalledWith(1);
  });

  it("20. múltiplas evidências independentes: uma com relevantPage, outra sem, cada uma com seu próprio rótulo e navegação", async () => {
    const user = userEvent.setup();
    const onNavigateToPage = vi.fn();
    render(
      <SourceBadges
        evidence={[
          { evidenceId: "E1", chunkId: "s:0", pages: [1, 2, 3, 4], startPage: 1, endPage: 4, relevantPage: 3 },
          { evidenceId: "E2", chunkId: "s:1", pages: [7, 8], startPage: 7, endPage: 8 },
        ]}
        onNavigateToPage={onNavigateToPage}
      />,
    );

    const badgeWithRelevantPage = screen.getByText("Página 3 · fonte: páginas 1–4");
    const badgeWithoutRelevantPage = screen.getByText("Páginas 7–8");
    expect(badgeWithRelevantPage).toBeInTheDocument();
    expect(badgeWithoutRelevantPage).toBeInTheDocument();

    await user.click(badgeWithRelevantPage);
    expect(onNavigateToPage).toHaveBeenLastCalledWith(3);
    await user.click(badgeWithoutRelevantPage);
    expect(onNavigateToPage).toHaveBeenLastCalledWith(7);
  });

  it("relevantPage igual a startPage===endPage (evidência de página única) não força o rótulo composto — mostra só 'Página N'", () => {
    render(
      <SourceBadges
        evidence={[{ evidenceId: "E1", chunkId: "s:0", pages: [5], startPage: 5, endPage: 5, relevantPage: 5 }]}
        onNavigateToPage={() => {}}
      />,
    );
    expect(screen.getByText("Página 5")).toBeInTheDocument();
    expect(screen.queryByText(/fonte:/)).not.toBeInTheDocument();
  });

  it("Sprint 01P: clique numa fonte dispara intel_source_clicked, só com tool_id — sem chunkId/sessionId/página", async () => {
    trackMock.mockClear();
    const user = userEvent.setup();
    render(
      <SourceBadges
        evidence={[{ evidenceId: "E1", chunkId: "s:0", pages: [3], startPage: 3, endPage: 3 }]}
        onNavigateToPage={() => {}}
      />,
    );
    await user.click(screen.getByText("Página 3"));

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("intel_source_clicked", { tool_id: "conversar-com-pdf" });
  });
});
