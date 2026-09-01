import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../AppShell";
import { __resetConsentForTests } from "@/analytics/consent";

describe("AppShell — isolamento da área administrativa", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetConsentForTests();
  });

  it("exibe o ConsentBanner público em uma rota comum quando o consentimento ainda não foi escolhido", () => {
    render(
      <MemoryRouter initialEntries={["/compactar-pdf"]}>
        <AppShell>
          <div>conteúdo</div>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: "Escolha sobre métricas" })).toBeInTheDocument();
  });

  it("nunca exibe o ConsentBanner em /admin/analytics, mesmo sem escolha de consentimento", () => {
    render(
      <MemoryRouter initialEntries={["/admin/analytics"]}>
        <AppShell>
          <div>painel</div>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("region", { name: "Escolha sobre métricas" })).not.toBeInTheDocument();
  });
});
