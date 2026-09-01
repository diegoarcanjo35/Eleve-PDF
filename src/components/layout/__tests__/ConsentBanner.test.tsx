import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsentBanner } from "../ConsentBanner";
import { __resetConsentForTests } from "@/analytics/consent";

describe("ConsentBanner — igualdade visual entre aceitar e recusar", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetConsentForTests();
  });

  it("os dois botões usam exatamente a mesma classe de estilo — nenhum é 'primary'", () => {
    render(<ConsentBanner />);

    const decline = screen.getByRole("button", { name: "Recusar" });
    const accept = screen.getByRole("button", { name: "Aceitar métricas" });

    expect(decline.className).toContain("button--choice");
    expect(accept.className).toContain("button--choice");
    // Nenhuma das duas ações usa a classe de destaque forte usada em CTAs.
    expect(decline.className).not.toContain("button--primary");
    expect(accept.className).not.toContain("button--primary");
    // Mesmas classes exatamente — garante peso visual idêntico.
    expect(decline.className).toBe(accept.className);
  });

  it("ordem de tabulação é lógica: Recusar antes de Aceitar no DOM", () => {
    render(<ConsentBanner />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("Recusar");
    expect(buttons[1]).toHaveTextContent("Aceitar métricas");
  });
});
