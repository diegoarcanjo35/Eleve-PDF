import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrivacyBadge } from "../PrivacyBadge";
import { privacyBadgeLabel } from "../privacyBadgeLabel";

describe("privacyBadgeLabel", () => {
  it("1. ferramentas clássicas continuam com a comunicação de processamento local", () => {
    expect(privacyBadgeLabel("/")).toBe("Processamento local");
    expect(privacyBadgeLabel("/compactar-pdf")).toBe("Processamento local");
    expect(privacyBadgeLabel("/dividir-pdf-por-tamanho")).toBe("Processamento local");
    expect(privacyBadgeLabel("/juntar-pdfs")).toBe("Processamento local");
  });

  it("2. /conversar-com-pdf nunca recebe a afirmação de processamento só local", () => {
    expect(privacyBadgeLabel("/conversar-com-pdf")).not.toBe("Processamento local");
    expect(privacyBadgeLabel("/conversar-com-pdf")).toBe("Processamento seguro com Eleve IA");
  });
});

describe("PrivacyBadge", () => {
  it("1. renderiza 'Processamento local' numa ferramenta clássica", () => {
    render(<PrivacyBadge pathname="/compactar-pdf" />);
    expect(screen.getByText("Processamento local")).toBeInTheDocument();
  });

  it("2. renderiza a comunicação específica em /conversar-com-pdf, nunca a afirmação enganosa", () => {
    render(<PrivacyBadge pathname="/conversar-com-pdf" />);
    expect(screen.getByText("Processamento seguro com Eleve IA")).toBeInTheDocument();
    expect(screen.queryByText("Processamento local")).not.toBeInTheDocument();
  });
});
