import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel, type ChatMessage } from "../ChatPanel";

describe("ChatPanel", () => {
  it("envia a pergunta digitada e limpa o campo", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onNavigateToSource={() => {}} sending={false} />);

    const input = screen.getByPlaceholderText(/pergunte algo/i);
    await user.type(input, "Qual é o prazo do contrato?");
    await user.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    expect(onSend).toHaveBeenCalledWith("Qual é o prazo do contrato?");
    expect(input).toHaveValue("");
  });

  it("não envia pergunta vazia/só espaços", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onNavigateToSource={() => {}} sending={false} />);
    await user.type(screen.getByPlaceholderText(/pergunte algo/i), "   ");
    expect(screen.getByRole("button", { name: /enviar pergunta/i })).toBeDisabled();
  });

  it("9. renderiza uma resposta normal fundamentada", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "Quem coordena o projeto?" },
      {
        id: "2",
        role: "assistant",
        status: "answered",
        answer: "Marina Costa coordena o projeto.",
        evidence: [{ evidenceId: "E1", chunkId: "s:0", pages: [3], startPage: 3, endPage: 3 }],
      },
    ];
    render(<ChatPanel messages={messages} onSend={() => {}} onNavigateToSource={() => {}} sending={false} />);
    expect(screen.getByText("Marina Costa coordena o projeto.")).toBeInTheDocument();
    expect(screen.getByText("Página 3")).toBeInTheDocument();
  });

  it("10. renderiza insufficientEvidence com mensagem amigável, nunca como fato confirmado", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "assistant", status: "insufficient", evidence: [] },
    ];
    render(<ChatPanel messages={messages} onSend={() => {}} onNavigateToSource={() => {}} sending={false} />);
    expect(
      screen.getByText(/não encontrei informações suficientes neste documento para responder com segurança/i),
    ).toBeInTheDocument();
  });

  it("12. clicar numa fonte da resposta chama onNavigateToSource com a página real", async () => {
    const user = userEvent.setup();
    const onNavigateToSource = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        status: "answered",
        answer: "resposta",
        evidence: [{ evidenceId: "E1", chunkId: "s:0", pages: [9], startPage: 9, endPage: 9 }],
      },
    ];
    render(<ChatPanel messages={messages} onSend={() => {}} onNavigateToSource={onNavigateToSource} sending={false} />);
    await user.click(screen.getByText("Página 9"));
    expect(onNavigateToSource).toHaveBeenCalledWith(9);
  });

  it("16. renderiza estado de erro controlado, sem detalhes técnicos", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "assistant", status: "error", errorMessage: "Não foi possível obter uma resposta agora. Tente novamente." },
    ];
    render(<ChatPanel messages={messages} onSend={() => {}} onNavigateToSource={() => {}} sending={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível obter uma resposta/i);
  });

  it("desabilita input/botão enquanto uma pergunta está em andamento", () => {
    render(<ChatPanel messages={[]} onSend={() => {}} onNavigateToSource={() => {}} sending />);
    expect(screen.getByPlaceholderText(/pergunte algo/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /enviar pergunta/i })).toBeDisabled();
  });

  it("1. Enter envia a pergunta (mesmo caminho do clique)", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onNavigateToSource={() => {}} sending={false} />);
    const input = screen.getByPlaceholderText(/pergunte algo/i);
    await user.type(input, "Qual é o prazo do contrato?{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Qual é o prazo do contrato?");
    expect(input).toHaveValue("");
  });

  it("2. Shift+Enter não envia a pergunta", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onNavigateToSource={() => {}} sending={false} />);
    const input = screen.getByPlaceholderText(/pergunte algo/i);
    await user.type(input, "Qual é o prazo{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("3. Enter com campo vazio não envia", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onNavigateToSource={() => {}} sending={false} />);
    const input = screen.getByPlaceholderText(/pergunte algo/i);
    input.focus();
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("4. Enter durante uma resposta em andamento (sending=true) não duplica o envio", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onNavigateToSource={() => {}} sending />);
    // Campo já vem desabilitado enquanto `sending`, mas o handler de teclado
    // também precisa respeitar isso independentemente do atributo `disabled`.
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("5. clique no botão de enviar usa o mesmo caminho que o Enter (onSend chamado uma única vez, campo limpo)", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onNavigateToSource={() => {}} sending={false} />);
    const input = screen.getByPlaceholderText(/pergunte algo/i);
    await user.type(input, "Quais valores aparecem?");
    await user.click(screen.getByRole("button", { name: /enviar pergunta/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Quais valores aparecem?");
    expect(input).toHaveValue("");
  });

  it("8. quick actions aparecem só antes da primeira pergunta e enviam ao clicar", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onNavigateToSource={() => {}} sending={false} />);
    const action = screen.getByRole("button", { name: "Resuma este documento" });
    await user.click(action);
    expect(onSend).toHaveBeenCalledWith("Resuma este documento");
  });

  it("quick actions não aparecem quando já existem mensagens", () => {
    const messages: ChatMessage[] = [{ id: "1", role: "user", text: "oi" }];
    render(<ChatPanel messages={messages} onSend={() => {}} onNavigateToSource={() => {}} sending={false} />);
    expect(screen.queryByRole("button", { name: "Resuma este documento" })).not.toBeInTheDocument();
  });

  it("quick actions ficam desabilitadas enquanto uma pergunta está em andamento", () => {
    render(<ChatPanel messages={[]} onSend={() => {}} onNavigateToSource={() => {}} sending />);
    expect(screen.getByRole("button", { name: "Resuma este documento" })).toBeDisabled();
  });

  it("17. campo de pergunta recebe foco automaticamente quando o chat fica disponível", () => {
    render(<ChatPanel messages={[]} onSend={() => {}} onNavigateToSource={() => {}} sending={false} />);
    expect(screen.getByPlaceholderText(/pergunte algo/i)).toHaveFocus();
  });
});
