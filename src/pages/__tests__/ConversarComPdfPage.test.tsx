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

function installFetchMock() {
  fetchLog = [];
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

function mockSuccessfulExtraction(overallStatus: "ok" | "unsupported" = "ok") {
  validateMock.mockReturnValue({ promise: Promise.resolve({ pageCount: 2, structure: {} }) });
  extractMock.mockReturnValue({
    promise: Promise.resolve({
      document: {
        pageCount: 2,
        overallStatus,
        pages: [
          { pageNumber: 1, status: "text", blocks: [{ text: "Conteúdo da página um.", boundingBox: { x: 0, y: 0, width: 1, height: 1 } }], pageSize: { width: 1, height: 1 } },
          { pageNumber: 2, status: "text", blocks: [{ text: "Conteúdo da página dois.", boundingBox: { x: 0, y: 0, width: 1, height: 1 } }], pageSize: { width: 1, height: 1 } },
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

    const iframe = screen.getByTitle(/visualização de documento\.pdf/i) as HTMLIFrameElement;
    expect(iframe.src).toContain("#page=1");

    await userEvent.click(screen.getByText("Página 2"));
    expect(iframe.src).toContain("#page=2");
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

  it("16. erro do backend em /ask vira mensagem de erro controlada, sem detalhes técnicos", async () => {
    mockSuccessfulExtraction();
    askResponse = { status: 502, body: { error: "detalhe interno que nunca deveria aparecer" } };
    const { container } = renderPage();
    await reachReadyState(container);
    await userEvent.type(screen.getByPlaceholderText(/pergunte algo/i), "pergunta");
    await userEvent.click(screen.getByRole("button", { name: /enviar pergunta/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível obter uma resposta/i);
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
});
