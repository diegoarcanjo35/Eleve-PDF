import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ConversarComPdfPage from "../ConversarComPdfPage";
import { setConsent, __resetConsentForTests } from "@/analytics/consent";
import { __resetSessionStateForTests } from "@/analytics/session";

const validateMock = vi.fn();
const extractMock = vi.fn();

vi.mock("@/lib/pdfWorkerClient", () => ({
  requestValidate: (...args: unknown[]) => validateMock(...args),
  requestExtractText: (...args: unknown[]) => extractMock(...args),
}));

const CAPABILITY = "fake-capability-nunca-real-0123456789ABCDEFxyz";
const SESSION_ID = "session-abc";

interface FetchLogEntry {
  url: string;
  headers: Headers;
  body: unknown;
}

let fetchLog: FetchLogEntry[];
let askResponse: { body: unknown; status: number };
/** Sprint 01N: quando definido, o mock de `/ingest` aguarda esta promise
 * antes de responder — usado só pelo teste do estado "preparando", que
 * precisa de uma janela observável entre o upload e o `stage: "ready"`. */
let ingestGate: Promise<void> | null = null;

function installFetchMock() {
  fetchLog = [];
  ingestGate = null;
  askResponse = {
    body: { sessionId: SESSION_ID, answer: "Resposta de teste.", insufficientEvidence: false, evidence: [] },
    status: 200,
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchLog.push({ url, headers, body });

      if (url === "/api/intelligence/sessions") {
        return new Response(
          JSON.stringify({ sessionId: SESSION_ID, sessionCapability: CAPABILITY, status: "created", expiresAt: "2026-01-01T00:30:00.000Z" }),
          { status: 201 },
        );
      }
      if (url === `/api/intelligence/sessions/${SESSION_ID}/ingest`) {
        if (ingestGate) await ingestGate;
        return new Response(
          JSON.stringify({
            sessionId: SESSION_ID,
            status: "ready",
            pageCount: 2,
            chunkCount: 3,
            expiresAt: "2026-01-01T00:30:00.000Z",
            chunkingStrategyVersion: "v1",
          }),
          { status: 200 },
        );
      }
      if (url === `/api/intelligence/sessions/${SESSION_ID}/ask`) {
        return new Response(JSON.stringify(askResponse.body), { status: askResponse.status });
      }
      if (url === "/api/analytics/event") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`fetch inesperado neste teste: ${url}`);
    }),
  );
}

function mockSuccessfulExtraction(overallStatus: "ok" | "partial" | "unsupported" = "ok") {
  validateMock.mockReturnValue({ promise: Promise.resolve({ pageCount: 2, structure: {} }) });
  const page2 =
    overallStatus === "partial"
      ? { pageNumber: 2, status: "no-text", blocks: [], pageSize: { width: 1, height: 1 } }
      : { pageNumber: 2, status: "text", blocks: [{ text: "Conteúdo da página dois.", boundingBox: { x: 0, y: 0, width: 1, height: 1 } }], pageSize: { width: 1, height: 1 } };
  extractMock.mockReturnValue({
    promise: Promise.resolve({
      document: {
        pageCount: 2,
        overallStatus,
        pages: [
          { pageNumber: 1, status: "text", blocks: [{ text: "Conteúdo da página um.", boundingBox: { x: 0, y: 0, width: 1, height: 1 } }], pageSize: { width: 1, height: 1 } },
          page2,
        ],
      },
    }),
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConversarComPdfPage />
    </MemoryRouter>,
  );
}

async function uploadFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], "documento.pdf", { type: "application/pdf" });
  await userEvent.upload(input, file);
}

async function reachReadyState(container: HTMLElement) {
  await uploadFile(container);
  await waitFor(() => expect(screen.getByPlaceholderText(/pergunte algo/i)).toBeInTheDocument());
}

describe("ConversarComPdfPage", () => {
  beforeEach(() => {
    installFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    __resetConsentForTests();
    __resetSessionStateForTests();
  });

  it("1. carrega a rota com título, texto de apoio, área de upload e nota de privacidade correta (não a genérica)", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Converse com seu PDF" })).toBeInTheDocument();
    expect(screen.getByText(/arraste um pdf aqui/i)).toBeInTheDocument();
    expect(screen.getByText(/processado com segurança pelos serviços de inteligência da plataforma/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhum arquivo é enviado a servidores/i)).not.toBeInTheDocument();
  });

  it("4/6. ingest e ask são enviados com Authorization: Bearer <capability>", async () => {
    mockSuccessfulExtraction();
    const { container } = renderPage();
    await reachReadyState(container);

    const ingestCall = fetchLog.find((entry) => entry.url === `/api/intelligence/sessions/${SESSION_ID}/ingest`);
    expect(ingestCall?.headers.get("Authorization")).toBe(`Bearer ${CAPABILITY}`);

    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "Quem assina o contrato?");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));
    await waitFor(() => expect(screen.getByText("Resposta de teste.")).toBeInTheDocument());

    const askCall = fetchLog.find((entry) => entry.url === `/api/intelligence/sessions/${SESSION_ID}/ask`);
    expect(askCall?.headers.get("Authorization")).toBe(`Bearer ${CAPABILITY}`);
  });

  it("8. PDF sem texto bloqueia o fluxo antes de criar sessão/chamar IA, e avisa sobre OCR", async () => {
    mockSuccessfulExtraction("unsupported");
    const { container } = renderPage();
    await uploadFile(container);

    await waitFor(() => expect(screen.getByText(/ainda não oferece leitura de documentos digitalizados/i)).toBeInTheDocument());
    expect(fetchLog.some((entry) => entry.url.startsWith("/api/intelligence"))).toBe(false);
  });

  it("9. resposta normal fundamentada renderiza", async () => {
    mockSuccessfulExtraction();
    askResponse = {
      status: 200,
      body: {
        sessionId: SESSION_ID,
        answer: "O prazo é de 12 meses.",
        insufficientEvidence: false,
        evidence: [{ evidenceId: "E1", chunkId: `${SESSION_ID}:0`, pages: [4], startPage: 4, endPage: 4 }],
      },
    };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "Qual é o prazo?");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    await waitFor(() => expect(screen.getByText("O prazo é de 12 meses.")).toBeInTheDocument());
    expect(screen.getByText("Página 4")).toBeInTheDocument();
  });

  it("10. insufficientEvidence renderiza a mensagem amigável, nunca como fato confirmado", async () => {
    mockSuccessfulExtraction();
    askResponse = {
      status: 200,
      body: { sessionId: SESSION_ID, answer: null, insufficientEvidence: true, evidence: [] },
    };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "Qual é o orçamento?");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    await waitFor(() =>
      expect(screen.getByText(/não encontrei informações suficientes neste documento/i)).toBeInTheDocument(),
    );
  });

  it("11/12. fontes usam páginas reais do backend e clicar navega o visualizador", async () => {
    mockSuccessfulExtraction();
    askResponse = {
      status: 200,
      body: {
        sessionId: SESSION_ID,
        answer: "Resposta.",
        insufficientEvidence: false,
        evidence: [{ evidenceId: "E1", chunkId: `${SESSION_ID}:1`, pages: [2], startPage: 2, endPage: 2 }],
      },
    };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));
    await waitFor(() => expect(screen.getByText("Página 2")).toBeInTheDocument());

    expect((screen.getByTitle(/visualização de documento\.pdf/i) as HTMLIFrameElement).src).toContain("#page=1");

    await userEvent.click(screen.getByText("Página 2"));
    // Sprint 01F.2: o iframe é remontado (novo nó DOM) a cada troca de
    // página — busca de novo em vez de reaproveitar a referência antiga.
    expect((screen.getByTitle(/visualização de documento\.pdf/i) as HTMLIFrameElement).src).toContain("#page=2");
  });

  it("13. a capability nunca aparece em nenhuma URL chamada durante todo o fluxo", async () => {
    mockSuccessfulExtraction();
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));
    await waitFor(() => expect(screen.getByText("Resposta de teste.")).toBeInTheDocument());

    for (const entry of fetchLog) {
      expect(entry.url).not.toContain(CAPABILITY);
    }
  });

  it("14/15. capability, pergunta e resposta nunca vão para Analytics", async () => {
    setConsent("accepted");
    mockSuccessfulExtraction();
    askResponse = {
      status: 200,
      body: { sessionId: SESSION_ID, answer: "Conteúdo confidencial da resposta.", insufficientEvidence: false, evidence: [] },
    };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "Pergunta confidencial sobre o documento");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));
    await waitFor(() => expect(screen.getByText("Conteúdo confidencial da resposta.")).toBeInTheDocument());

    const analyticsCalls = fetchLog.filter((entry) => entry.url === "/api/analytics/event");
    expect(analyticsCalls.length).toBeGreaterThan(0);
    for (const call of analyticsCalls) {
      const serialized = JSON.stringify(call.body);
      expect(serialized).not.toContain(CAPABILITY);
      expect(serialized).not.toContain("Pergunta confidencial");
      expect(serialized).not.toContain("Conteúdo confidencial da resposta");
      expect(serialized).not.toContain(SESSION_ID);
    }
  });

  it("16. erro do backend em /ask vira mensagem de erro controlada, sem detalhes técnicos (Sprint 01N: 502 tem mensagem específica de indisponibilidade)", async () => {
    mockSuccessfulExtraction();
    askResponse = { status: 502, body: { error: "detalhe interno que nunca deveria aparecer" } };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/indisponível/i);
    expect(screen.queryByText(/detalhe interno/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/502/)).not.toBeInTheDocument();
  });

  it("17. uma nova montagem da página nunca restaura a sessão/capability anterior", async () => {
    mockSuccessfulExtraction();
    const first = renderPage();
    await reachReadyState(first.container);
    first.unmount();

    const second = renderPage();
    expect(screen.getByRole("heading", { name: "Converse com seu PDF" })).toBeInTheDocument();
    expect(screen.getByText(/arraste um pdf aqui/i)).toBeInTheDocument();
    second.unmount();
  });

  it("6. estado 'preparando' mostra progresso em linguagem simples, sem termos técnicos", async () => {
    mockSuccessfulExtraction();
    let releaseGate!: () => void;
    ingestGate = new Promise((resolve) => {
      releaseGate = resolve;
    });
    const { container } = renderPage();
    await uploadFile(container);

    await waitFor(() => expect(screen.getByText(/preparando a eleve ia para conversar/i)).toBeInTheDocument());
    const progress = screen.getByText(/preparando a eleve ia para conversar/i).closest(".progress");
    expect(progress).not.toBeNull();
    const progressText = progress?.textContent ?? "";
    expect(progressText).not.toMatch(/vectorize|embedding|chunk|d1|workers ai|luna|provider|token/i);

    releaseGate();
    await waitFor(() => expect(screen.getByPlaceholderText(/pergunte algo/i)).toBeInTheDocument());
  });

  it("7. estado 'pronto' mostra o campo de pergunta interativo, sem termos técnicos visíveis", async () => {
    mockSuccessfulExtraction();
    const { container } = renderPage();
    await reachReadyState(container);

    const input = screen.getByPlaceholderText(/pergunte algo/i);
    expect(input).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/vectorize|embedding|chunk|workers ai|luna\b/i);
  });

  it("21. relevantPage é preservado end-to-end e o badge mostra a página precisa e a amplitude real", async () => {
    mockSuccessfulExtraction(); // documento mockado tem pageCount=2
    askResponse = {
      status: 200,
      body: {
        sessionId: SESSION_ID,
        answer: "O código é HZ-9274.",
        insufficientEvidence: false,
        evidence: [{ evidenceId: "E1", chunkId: `${SESSION_ID}:0`, pages: [1, 2], startPage: 1, endPage: 2, relevantPage: 2 }],
      },
    };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "Qual é o código?");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    await waitFor(() => expect(screen.getByText("Página 2 · fonte: páginas 1–2")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Página 2 · fonte: páginas 1–2"));
    expect((screen.getByTitle(/visualização de documento\.pdf/i) as HTMLIFrameElement).src).toContain("#page=2");
  });

  it("sessão expirada (410) em /ask mostra mensagem específica orientando a trocar de documento", async () => {
    mockSuccessfulExtraction();
    askResponse = { status: 410, body: null };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/expirou/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/trocar documento/i);
  });

  it("rate limit (429) em /ask mostra mensagem específica, sem culpar o usuário nem expor status", async () => {
    mockSuccessfulExtraction();
    askResponse = { status: 429, body: null };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/muitas solicitações/i);
    expect(screen.queryByText(/429/)).not.toBeInTheDocument();
  });

  it("indisponibilidade (503) em /ask mostra mensagem de indisponibilidade temporária", async () => {
    mockSuccessfulExtraction();
    askResponse = { status: 503, body: null };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/indisponível/i);
  });

  it("33. trocar de documento limpa o histórico de chat anterior — próxima resposta nunca parece pertencer ao documento antigo", async () => {
    mockSuccessfulExtraction();
    askResponse = {
      status: 200,
      body: { sessionId: SESSION_ID, answer: "Resposta do primeiro documento.", insufficientEvidence: false, evidence: [] },
    };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));
    await waitFor(() => expect(screen.getByText("Resposta do primeiro documento.")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /trocar documento/i }));

    expect(screen.getByRole("heading", { name: "Converse com seu PDF" })).toBeInTheDocument();
    expect(screen.queryByText("Resposta do primeiro documento.")).not.toBeInTheDocument();

    await reachReadyState(container);
    expect(screen.queryByText("Resposta do primeiro documento.")).not.toBeInTheDocument();
  });

  it("acessibilidade: campo de pergunta tem label associado e botão de envio tem nome acessível", async () => {
    mockSuccessfulExtraction();
    const { container } = renderPage();
    await reachReadyState(container);

    expect(screen.getByRole("textbox", { name: /pergunta sobre o documento/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar pergunta/i })).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
  });

  describe("documento parcialmente extraído (Sprint 01N — ajuste final)", () => {
    it("1. partial com texto utilizável continua normalmente para a Eleve IA (sessão/ingest ocorrem)", async () => {
      mockSuccessfulExtraction("partial");
      const { container } = renderPage();
      await reachReadyState(container);

      expect(fetchLog.some((entry) => entry.url === "/api/intelligence/sessions")).toBe(true);
      expect(fetchLog.some((entry) => entry.url === `/api/intelligence/sessions/${SESSION_ID}/ingest`)).toBe(true);
    });

    it("2. aviso de extração parcial aparece assim que o documento fica pronto", async () => {
      mockSuccessfulExtraction("partial");
      const { container } = renderPage();
      await reachReadyState(container);

      expect(
        screen.getByText(/algumas páginas deste pdf não puderam ser lidas/i),
      ).toBeInTheDocument();
    });

    it("3/4. aviso permanece visível no estado pronto e depois de uma resposta", async () => {
      mockSuccessfulExtraction("partial");
      const { container } = renderPage();
      await reachReadyState(container);
      expect(screen.getByText(/algumas páginas deste pdf não puderam ser lidas/i)).toBeInTheDocument();

      await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
      await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));
      await waitFor(() => expect(screen.getByText("Resposta de teste.")).toBeInTheDocument());

      expect(screen.getByText(/algumas páginas deste pdf não puderam ser lidas/i)).toBeInTheDocument();
    });

    it("5. trocar de documento remove o aviso de extração parcial", async () => {
      mockSuccessfulExtraction("partial");
      const { container } = renderPage();
      await reachReadyState(container);
      expect(screen.getByText(/algumas páginas deste pdf não puderam ser lidas/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /trocar documento/i }));

      expect(screen.queryByText(/algumas páginas deste pdf não puderam ser lidas/i)).not.toBeInTheDocument();
    });

    it("6. um novo PDF totalmente 'ok' após um documento partial não herda o aviso anterior", async () => {
      mockSuccessfulExtraction("partial");
      const { container } = renderPage();
      await reachReadyState(container);
      expect(screen.getByText(/algumas páginas deste pdf não puderam ser lidas/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /trocar documento/i }));
      mockSuccessfulExtraction("ok");
      await reachReadyState(container);

      expect(screen.queryByText(/algumas páginas deste pdf não puderam ser lidas/i)).not.toBeInTheDocument();
    });

    it("7. documento sem texto utilizável ('unsupported') continua bloqueado, mesmo com uma página parcial — nunca confundido com 'partial'", async () => {
      mockSuccessfulExtraction("unsupported");
      const { container } = renderPage();
      await uploadFile(container);

      await waitFor(() => expect(screen.getByText(/ainda não oferece leitura de documentos digitalizados/i)).toBeInTheDocument());
      expect(fetchLog.some((entry) => entry.url.startsWith("/api/intelligence"))).toBe(false);
      expect(screen.queryByText(/algumas páginas deste pdf não puderam ser lidas/i)).not.toBeInTheDocument();
    });

    it("8. aviso de extração parcial tem semântica acessível (role=status, não role=alert)", async () => {
      mockSuccessfulExtraction("partial");
      const { container } = renderPage();
      await reachReadyState(container);

      const notice = screen.getByText(/algumas páginas deste pdf não puderam ser lidas/i);
      expect(notice.closest('[role="status"]') ?? notice).toHaveAttribute("role", "status");
      expect(screen.queryByRole("alert", { name: /algumas páginas/i })).not.toBeInTheDocument();
    });

    it("um documento 'ok' normal nunca mostra o aviso de extração parcial", async () => {
      mockSuccessfulExtraction("ok");
      const { container } = renderPage();
      await reachReadyState(container);

      expect(screen.queryByText(/algumas páginas deste pdf não puderam ser lidas/i)).not.toBeInTheDocument();
    });
  });
});
