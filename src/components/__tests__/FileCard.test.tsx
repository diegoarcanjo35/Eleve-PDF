import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileCard } from "../FileCard";

describe("FileCard", () => {
  it("shows file name, size and page count when ready", () => {
    render(
      <FileCard
        fileName="contrato.pdf"
        sizeBytes={2 * 1024 * 1024}
        pageCount={12}
        status="ready"
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("contrato.pdf")).toBeInTheDocument();
    expect(screen.getByText(/12 páginas/)).toBeInTheDocument();
    expect(screen.getByText(/pronto para processar/i)).toBeInTheDocument();
  });

  it("surfaces error messages accessibly via role=alert", () => {
    render(
      <FileCard
        fileName="ruim.pdf"
        sizeBytes={1000}
        pageCount={null}
        status="error"
        errorMessage="PDF protegido por senha."
        onRemove={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("PDF protegido por senha.");
  });

  it("calls onRemove when the remove button is activated", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <FileCard
        fileName="contrato.pdf"
        sizeBytes={1000}
        pageCount={1}
        status="ready"
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByRole("button", { name: /remover/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
