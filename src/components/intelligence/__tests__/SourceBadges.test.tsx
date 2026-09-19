import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceBadges } from "../SourceBadges";

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
});
