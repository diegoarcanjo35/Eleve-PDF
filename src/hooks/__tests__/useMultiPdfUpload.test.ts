import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMultiPdfUpload } from "../useMultiPdfUpload";
import { PdfAppError, messageFor } from "@/lib/errors";
import { MAX_MERGE_FILE_COUNT } from "@/lib/limits";
import { UNKNOWN_STRUCTURAL_FINDINGS, type StructuralFindings } from "@/lib/structuralFindings";

const READY_FINDINGS: StructuralFindings = {
  ...UNKNOWN_STRUCTURAL_FINDINGS,
  analyzedSuccessfully: true,
};

const { requestValidateMock } = vi.hoisted(() => ({ requestValidateMock: vi.fn() }));

vi.mock("@/lib/pdfWorkerClient", () => ({
  requestValidate: requestValidateMock,
}));

function pdfFile(name: string, content: number[]): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, ...content]); // "%PDF" + marcador
  return new File([bytes], name, { type: "application/pdf" });
}

function resolveValidate(pageCount: number) {
  return { promise: Promise.resolve({ pageCount, structure: READY_FINDINGS }) };
}

function rejectValidate(error: PdfAppError) {
  return { promise: Promise.reject(error) };
}

describe("useMultiPdfUpload", () => {
  beforeEach(() => {
    requestValidateMock.mockReset();
  });

  it("adiciona múltiplos arquivos válidos, mantendo a ordem de seleção", async () => {
    requestValidateMock.mockReturnValueOnce(resolveValidate(2)).mockReturnValueOnce(resolveValidate(3));
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    await act(async () => {
      await result.current.addFiles([pdfFile("a.pdf", [1]), pdfFile("b.pdf", [2])]);
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]!.file.name).toBe("a.pdf");
    expect(result.current.entries[1]!.file.name).toBe("b.pdf");
    expect(result.current.entries[0]!.validation).toMatchObject({ status: "ready", pageCount: 2 });
    expect(result.current.entries[1]!.validation).toMatchObject({ status: "ready", pageCount: 3 });
  });

  it("rejeita arquivo inválido (não-PDF) com mensagem clara", async () => {
    requestValidateMock.mockImplementationOnce(() =>
      rejectValidate(new PdfAppError("not-a-pdf", "não é pdf")),
    );
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    await act(async () => {
      await result.current.addFiles([pdfFile("nao-e-pdf.pdf", [9])]);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.validation).toEqual({
      status: "error",
      message: messageFor("not-a-pdf"),
    });
  });

  it("rejeita PDF corrompido com mensagem clara", async () => {
    requestValidateMock.mockImplementationOnce(() => rejectValidate(new PdfAppError("corrupted", "corrompido")));
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    await act(async () => {
      await result.current.addFiles([pdfFile("corrompido.pdf", [1, 2, 3])]);
    });

    expect(result.current.entries[0]!.validation).toEqual({
      status: "error",
      message: messageFor("corrupted"),
    });
  });

  it("rejeita PDF protegido por senha com mensagem clara", async () => {
    requestValidateMock.mockImplementationOnce(() =>
      rejectValidate(new PdfAppError("password-protected", "protegido")),
    );
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    await act(async () => {
      await result.current.addFiles([pdfFile("protegido.pdf", [4, 5])]);
    });

    expect(result.current.entries[0]!.validation).toEqual({
      status: "error",
      message: messageFor("password-protected"),
    });
  });

  it("detecta duplicação acidental por conteúdo idêntico (SHA-256) e não adiciona de novo", async () => {
    requestValidateMock.mockReturnValue(resolveValidate(1));
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    const original = pdfFile("relatorio.pdf", [7, 7, 7]);
    const copy = pdfFile("relatorio-copia.pdf", [7, 7, 7]); // mesmo conteúdo, nome diferente

    await act(async () => {
      await result.current.addFiles([original, copy]);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.file.name).toBe("relatorio.pdf");
    expect(result.current.notice).toMatch(/cópia de um arquivo já selecionado/i);
    expect(requestValidateMock).toHaveBeenCalledTimes(1);
  });

  it("arquivos com conteúdo diferente NÃO são tratados como duplicados, mesmo com nomes iguais", async () => {
    requestValidateMock.mockReturnValueOnce(resolveValidate(1)).mockReturnValueOnce(resolveValidate(2));
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    await act(async () => {
      await result.current.addFiles([pdfFile("documento.pdf", [1]), pdfFile("documento.pdf", [2])]);
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.notice).toBeNull();
  });

  it(`respeita o limite máximo de ${MAX_MERGE_FILE_COUNT} arquivos por operação`, async () => {
    requestValidateMock.mockReturnValue(resolveValidate(1));
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    const files = Array.from({ length: MAX_MERGE_FILE_COUNT + 5 }, (_, i) => pdfFile(`f${i}.pdf`, [i]));

    await act(async () => {
      await result.current.addFiles(files);
    });

    expect(result.current.entries).toHaveLength(MAX_MERGE_FILE_COUNT);
    expect(result.current.notice).toMatch(new RegExp(`até ${MAX_MERGE_FILE_COUNT} arquivos`));
  });

  it("remove um arquivo pelo id", async () => {
    requestValidateMock.mockReturnValueOnce(resolveValidate(1)).mockReturnValueOnce(resolveValidate(1));
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    await act(async () => {
      await result.current.addFiles([pdfFile("a.pdf", [1]), pdfFile("b.pdf", [2])]);
    });
    const idToRemove = result.current.entries[0]!.id;

    act(() => {
      result.current.removeFile(idToRemove);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.file.name).toBe("b.pdf");
  });

  it("limpa toda a seleção com clearAll", async () => {
    requestValidateMock.mockReturnValue(resolveValidate(1));
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    await act(async () => {
      await result.current.addFiles([pdfFile("a.pdf", [1]), pdfFile("b.pdf", [2])]);
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.entries).toHaveLength(0);
    expect(result.current.notice).toBeNull();
  });

  it("reordena arquivos com moveEntry, sem sair dos limites da lista", async () => {
    requestValidateMock.mockReturnValue(resolveValidate(1));
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs"));

    await act(async () => {
      await result.current.addFiles([pdfFile("a.pdf", [1]), pdfFile("b.pdf", [2]), pdfFile("c.pdf", [3])]);
    });
    const [idA] = result.current.entries.map((e) => e.id);

    act(() => {
      result.current.moveEntry(idA!, "down");
    });
    expect(result.current.entries.map((e) => e.file.name)).toEqual(["b.pdf", "a.pdf", "c.pdf"]);

    // mover o primeiro item para cima não deve fazer nada (já está no topo)
    const idFirst = result.current.entries[0]!.id;
    act(() => {
      result.current.moveEntry(idFirst, "up");
    });
    expect(result.current.entries.map((e) => e.file.name)).toEqual(["b.pdf", "a.pdf", "c.pdf"]);
  });

  it("chama onBeforeChange a cada adição/remoção/limpeza (usado para resetar resultados anteriores)", async () => {
    requestValidateMock.mockReturnValue(resolveValidate(1));
    const onBeforeChange = vi.fn();
    const { result } = renderHook(() => useMultiPdfUpload("juntar-pdfs", onBeforeChange));

    await act(async () => {
      await result.current.addFiles([pdfFile("a.pdf", [1])]);
    });
    expect(onBeforeChange).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.clearAll();
    });
    await waitFor(() => expect(onBeforeChange).toHaveBeenCalledTimes(2));
  });
});
