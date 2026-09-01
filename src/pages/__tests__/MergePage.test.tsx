import { describe, expect, it, vi, beforeEach } from "vitest";
import { configure, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MergePage from "../MergePage";
import { PdfAppError } from "@/lib/errors";
import { UNKNOWN_STRUCTURAL_FINDINGS, type StructuralFindings } from "@/lib/structuralFindings";

// Timeout padrão do testing-library (1000ms) para findBy*/waitFor já foi
// insuficiente sob carga (múltiplos arquivos de teste rodando em paralelo,
// competindo por CPU com o crypto.subtle.digest real usado na detecção de
// duplicidade) — resultando em flakiness ocasional, não em um bug do código:
// confirmado rodando este arquivo isolado (6/6 passando de forma estável em
// repetidas execuções) enquanto a suíte completa, com ~40 arquivos de teste
// disputando CPU ao mesmo tempo, ocasionalmente estourava o timeout. Também
// era preciso subir o testTimeout do próprio Vitest (padrão 5000ms) — um
// asyncUtilTimeout maior que o testTimeout do teste não ajuda em nada, pois
// o teste é interrompido primeiro pelo limite externo.
configure({ asyncUtilTimeout: 10000 });
vi.setConfig({ testTimeout: 15000 });

const READY_FINDINGS: StructuralFindings = {
  ...UNKNOWN_STRUCTURAL_FINDINGS,
  analyzedSuccessfully: true,
};

const RISKY_FINDINGS: StructuralFindings = {
  ...READY_FINDINGS,
  hasAcroForm: true,
};

const { requestValidateMock, requestMergeMock } = vi.hoisted(() => ({
  requestValidateMock: vi.fn(),
  requestMergeMock: vi.fn(),
}));

vi.mock("@/lib/pdfWorkerClient", () => ({
  requestValidate: requestValidateMock,
  requestMerge: requestMergeMock,
}));

function pdfFile(name: string, marker: number): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, marker]);
  return new File([bytes], name, { type: "application/pdf" });
}

function readyOnce(pageCount: number, structure: StructuralFindings = READY_FINDINGS) {
  return { promise: Promise.resolve({ pageCount, structure }) };
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("input[type=file] não encontrado");
  return input as HTMLInputElement;
}

function renderMergePage() {
  return render(
    <MemoryRouter>
      <MergePage />
    </MemoryRouter>,
  );
}

describe("MergePage", () => {
  beforeEach(() => {
    requestValidateMock.mockReset();
    requestMergeMock.mockReset();
    // jsdom não implementa URL.createObjectURL/revokeObjectURL — necessário só
    // para o clique em "Baixar PDF único" não lançar durante o teste.
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => "blob:mock");
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
  });

  it("carrega a ferramenta funcional (upload, título, aviso local)", () => {
    renderMergePage();
    expect(screen.getByRole("heading", { name: "Juntar PDFs" })).toBeInTheDocument();
    expect(screen.getByText(/arraste dois ou mais pdfs aqui/i)).toBeInTheDocument();
    expect(screen.getByText(/processado no seu dispositivo, nunca enviado a servidores/i)).toBeInTheDocument();
  });

  it("seleciona dois PDFs válidos, lista os arquivos na ordem e habilita o botão de juntar", async () => {
    requestValidateMock.mockReturnValueOnce(readyOnce(2)).mockReturnValueOnce(readyOnce(3));
    const user = userEvent.setup();
    const { container } = renderMergePage();

    await user.upload(fileInput(container), [pdfFile("a.pdf", 1), pdfFile("b.pdf", 2)]);

    const list = await screen.findByRole("list", { name: /arquivos selecionados, na ordem/i });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("a.pdf")).toBeInTheDocument();
    expect(within(items[1]!).getByText("b.pdf")).toBeInTheDocument();

    const mergeButton = await screen.findByRole("button", { name: "Juntar 2 PDFs" });
    expect(mergeButton).toBeEnabled();
  });

  it("mostra mensagem de erro clara e acessível para arquivo inválido/corrompido", async () => {
    requestValidateMock.mockImplementationOnce(() => ({
      promise: Promise.reject(new PdfAppError("corrupted", "corrompido")),
    }));
    const user = userEvent.setup();
    const { container } = renderMergePage();

    await user.upload(fileInput(container), [pdfFile("corrompido.pdf", 9)]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/corrompido ou incompleto/i);
  });

  it("mostra o aviso de estruturas especiais e só habilita o botão após a confirmação consciente do risco", async () => {
    requestValidateMock.mockReturnValueOnce(readyOnce(1, RISKY_FINDINGS)).mockReturnValueOnce(readyOnce(1));
    const user = userEvent.setup();
    const { container } = renderMergePage();

    await user.upload(fileInput(container), [pdfFile("com-formulario.pdf", 1), pdfFile("simples.pdf", 2)]);

    const mergeButton = await screen.findByRole("button", { name: "Juntar 2 PDFs" });
    expect(mergeButton).toBeDisabled();
    expect(screen.getByText(/estruturas de nível de documento/i)).toBeInTheDocument();

    const confirmCheckbox = screen.getByRole("checkbox", { name: /entendo o risco/i });
    await user.click(confirmCheckbox);
    expect(mergeButton).toBeEnabled();
  });

  it("fluxo completo: junta os PDFs e mostra o resultado, com opção de baixar e recomeçar", async () => {
    requestValidateMock.mockReturnValueOnce(readyOnce(2)).mockReturnValueOnce(readyOnce(3));
    requestMergeMock.mockReturnValueOnce({
      promise: Promise.resolve({
        type: "merge-success",
        id: "req-1",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
        totalPages: 5,
        fileCount: 2,
      }),
      cancel: () => {},
    });
    const user = userEvent.setup();
    const { container } = renderMergePage();

    await user.upload(fileInput(container), [pdfFile("a.pdf", 1), pdfFile("b.pdf", 2)]);
    const mergeButton = await screen.findByRole("button", { name: "Juntar 2 PDFs" });
    await user.click(mergeButton);

    const resultHeading = await screen.findByText("União concluída");
    const result = resultHeading.closest('[role="status"]') as HTMLElement;
    expect(result).not.toBeNull();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(within(result).getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Baixar PDF único" }));
    await user.click(screen.getByRole("button", { name: "Juntar outros PDFs" }));

    expect(screen.queryByText("União concluída")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /arquivos selecionados/i })).not.toBeInTheDocument();
  });

  it("cada item da lista tem controles de mover/remover acessíveis por teclado (aria-label descritivo)", async () => {
    requestValidateMock.mockReturnValueOnce(readyOnce(1)).mockReturnValueOnce(readyOnce(1));
    const user = userEvent.setup();
    const { container } = renderMergePage();

    await user.upload(fileInput(container), [pdfFile("a.pdf", 1), pdfFile("b.pdf", 2)]);
    await screen.findByRole("list", { name: /arquivos selecionados/i });

    expect(screen.getByRole("button", { name: "Mover a.pdf para baixo na ordem" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mover a.pdf para cima na ordem" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remover a.pdf da seleção" })).toBeEnabled();
  });
});
