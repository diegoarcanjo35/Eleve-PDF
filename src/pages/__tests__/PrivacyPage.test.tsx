import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import PrivacyPage from "../PrivacyPage";
import { __resetConsentForTests, getConsent } from "@/analytics/consent";

describe("PrivacyPage — a escolha de métricas pode ser revisada", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetConsentForTests();
  });

  it("permite aceitar e depois recusar métricas a qualquer momento", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Aceitar métricas" }));
    expect(getConsent()).toBe("accepted");
    expect(screen.getByText(/métricas aceitas/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Recusar métricas" }));
    expect(getConsent()).toBe("declined");
    expect(screen.getByText(/métricas recusadas/i)).toBeInTheDocument();
  });
});
