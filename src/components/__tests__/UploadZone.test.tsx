import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadZone } from "../UploadZone";

describe("UploadZone", () => {
  it("renders the upload affordance and privacy hint", () => {
    render(<UploadZone onFileSelected={() => {}} />);
    expect(
      screen.getByText(/arraste um pdf aqui ou clique para selecionar/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/processado no seu dispositivo/i)).toBeInTheDocument();
  });

  it("is reachable and activatable via keyboard (Enter opens the file picker)", async () => {
    const user = userEvent.setup();
    render(<UploadZone onFileSelected={() => {}} />);
    const zone = screen.getByRole("button", { name: /selecionar arquivo|arraste/i });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    zone.focus();
    expect(zone).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(clickSpy).toHaveBeenCalled();
  });

  it("does not open the picker when disabled", async () => {
    const user = userEvent.setup();
    render(<UploadZone onFileSelected={() => {}} disabled />);
    const zone = screen.getByRole("button", { name: /selecionar arquivo|arraste/i });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    await user.click(zone);
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
