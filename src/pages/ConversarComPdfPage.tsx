import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { UploadZone } from "@/components/UploadZone";
import { FileCard } from "@/components/FileCard";
import { ProgressBar } from "@/components/ProgressBar";
import { DocumentViewerPane } from "@/components/intelligence/DocumentViewerPane";
import { ChatPanel, type ChatAssistantMessage, type ChatMessage, type ChatUserMessage } from "@/components/intelligence/ChatPanel";
import { useIntelligenceSession, type IntelligenceStage } from "@/hooks/useIntelligenceSession";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { track } from "@/analytics/client";
import { findSeoPage } from "@shared/seo/pages";
import { IntelligenceHttpError, friendlyIntelligenceErrorMessage } from "@/lib/intelligenceErrors";

const TOOL_ID = "conversar-com-pdf" as const;
const PAGE_META = findSeoPage("/conversar-com-pdf")!;

const STAGE_LABELS: Partial<Record<IntelligenceStage, string>> = {
  validating: "Lendo seu arquivo…",
  extracting: "Analisando o conteúdo do documento…",
  preparing: "Preparando a Eleve IA para conversar sobre este documento…",
};

function nextMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ConversarComPdfPage() {
  useDocumentMeta(PAGE_META);

  useEffect(() => {
    track("tool_open", { tool_id: TOOL_ID });
  }, []);

  const { stage, errorMessage, file, pageCount, viewerBytes, extractProgress, handleFileSelected, reset, ask } =
    useIntelligenceSession();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (stage === "ready") setCurrentPage(1);
  }, [stage]);

  const handleReset = useCallback(() => {
    reset();
    setMessages([]);
    setCurrentPage(1);
  }, [reset]);

  const handleSend = useCallback(
    async (question: string) => {
      const userMessage: ChatUserMessage = { id: nextMessageId(), role: "user", text: question };
      const pendingId = nextMessageId();
      const pendingMessage: ChatAssistantMessage = { id: pendingId, role: "assistant", status: "pending" };
      setMessages((prev) => [...prev, userMessage, pendingMessage]);
      setSending(true);
      try {
        const result = await ask(question);
        setMessages((prev) =>
          prev.map((message): ChatMessage => {
            if (message.role !== "assistant" || message.id !== pendingId) return message;
            if (result.kind === "propagating") {
              return { ...message, status: "propagating" };
            }
            const { answer, insufficientEvidence, evidence } = result.data;
            if (insufficientEvidence || answer === null) {
              return { ...message, status: "insufficient", evidence };
            }
            return { ...message, status: "answered", answer, evidence };
          }),
        );
      } catch (error) {
        const friendlyMessage =
          error instanceof IntelligenceHttpError
            ? friendlyIntelligenceErrorMessage(error.status, "asking")
            : friendlyIntelligenceErrorMessage(undefined, "asking");
        setMessages((prev) =>
          prev.map((message): ChatMessage =>
            message.role === "assistant" && message.id === pendingId
              ? { ...message, status: "error", errorMessage: friendlyMessage }
              : message,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [ask],
  );

  const isBusy = stage === "validating" || stage === "extracting" || stage === "preparing";

  return (
    <div className="page-container">
      {stage === "ready" && viewerBytes && file ? (
        <div className="intel-layout">
          <div className="intel-layout__header">
            <nav className="breadcrumb" aria-label="Trilha de navegação">
              <Link to="/">
                <ChevronLeft size={16} aria-hidden="true" />
                Home
              </Link>
            </nav>
            <button type="button" className="button button--secondary" onClick={handleReset}>
              Trocar documento
            </button>
          </div>
          <div className="intel-layout__panes">
            <div className="intel-layout__viewer">
              <DocumentViewerPane
                fileBytes={viewerBytes}
                fileName={file.name}
                pageCount={pageCount ?? 1}
                currentPage={currentPage}
                onPageChange={(page) => setCurrentPage(Math.min(Math.max(page, 1), pageCount ?? 1))}
              />
            </div>
            <div className="intel-layout__chat">
              <div className="intel-layout__chat-header">
                <MessageCircleQuestion size={18} aria-hidden="true" />
                <span>Eleve IA</span>
              </div>
              <ChatPanel
                messages={messages}
                onSend={handleSend}
                onNavigateToSource={(page) => setCurrentPage(Math.min(Math.max(page, 1), pageCount ?? 1))}
                sending={sending}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="tool-page">
          <nav className="breadcrumb" aria-label="Trilha de navegação">
            <Link to="/">
              <ChevronLeft size={16} aria-hidden="true" />
              Home
            </Link>
          </nav>

          <div className="tool-page__header">
            <h1 className="tool-page__title">Converse com seu PDF</h1>
            <p className="tool-page__description">
              Envie um PDF e faça perguntas sobre o conteúdo dele. A Eleve IA responde com base no
              documento e sempre indica as páginas de onde tirou a informação.
            </p>
            <span className="tool-page__local-note">
              <ShieldCheck size={15} aria-hidden="true" />
              O arquivo é processado inicialmente no seu navegador. Para gerar respostas com a
              Eleve IA, o texto necessário do documento é processado com segurança pelos serviços
              de inteligência da plataforma.
            </span>
          </div>

          {stage === "idle" && (
            <UploadZone
              onFileSelected={handleFileSelected}
              hint="Apenas arquivos .pdf · o texto necessário é processado com segurança pela Eleve IA"
            />
          )}

          {file && stage !== "idle" && (
            <FileCard
              fileName={file.name}
              sizeBytes={file.size}
              pageCount={pageCount}
              status={stage === "error" ? "error" : isBusy ? "validating" : "ready"}
              errorMessage={stage === "error" ? (errorMessage ?? undefined) : undefined}
              onRemove={handleReset}
            />
          )}

          {isBusy && (
            <ProgressBar
              label={STAGE_LABELS[stage] ?? "Processando…"}
              current={extractProgress?.current ?? 0}
              total={extractProgress?.total ?? 0}
            />
          )}

          {stage === "unsupported" && (
            <div className="notice notice--warning">
              <p>
                Este PDF parece ser digitalizado (imagem) e não tem texto reconhecível. Esta versão
                do Eleve IA ainda não oferece leitura de documentos digitalizados (OCR).
              </p>
              <button type="button" className="button button--secondary" onClick={handleReset}>
                Escolher outro arquivo
              </button>
            </div>
          )}

          {stage === "error" && errorMessage && (
            <p className="notice notice--error" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
