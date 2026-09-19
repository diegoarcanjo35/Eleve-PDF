import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { MAX_QUESTION_CHARS } from "@shared/intelligence/constants";
import type { AskEvidence } from "@shared/intelligence/types";
import { SourceBadges } from "./SourceBadges";

export interface ChatUserMessage {
  id: string;
  role: "user";
  text: string;
}

export interface ChatAssistantMessage {
  id: string;
  role: "assistant";
  status: "pending" | "answered" | "insufficient" | "propagating" | "error";
  answer?: string | null;
  evidence?: AskEvidence[];
  errorMessage?: string;
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage;

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (question: string) => void;
  onNavigateToSource: (page: number) => void;
  /** Verdadeiro enquanto uma pergunta está em andamento — impede novo envio,
   * nunca implementa fila/concorrência de perguntas nesta sprint. */
  sending: boolean;
}

const INSUFFICIENT_EVIDENCE_MESSAGE =
  "Não encontrei informações suficientes neste documento para responder com segurança.";
const PROPAGATING_MESSAGE =
  "Ainda estamos finalizando a preparação deste documento. Tente perguntar novamente em alguns segundos.";

/**
 * Chat da Eleve IA — histórico só em memória (não é conversa multi-turno no
 * backend: cada pergunta chega isolada ao `/ask`, ver `useIntelligenceSession`).
 * O histórico visual existe só para a experiência do usuário nesta aba,
 * nunca é enviado de volta como contexto.
 */
export function ChatPanel({ messages, onSend, onNavigateToSource, sending }: ChatPanelProps) {
  const [question, setQuestion] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setQuestion("");
  };

  return (
    <div className="intel-chat">
      <div className="intel-chat__messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="intel-chat__empty">
            Faça uma pergunta sobre o conteúdo deste documento para começar.
          </p>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="intel-message intel-message--user">
              <p>{message.text}</p>
            </div>
          ) : (
            <div key={message.id} className="intel-message intel-message--assistant">
              {message.status === "pending" && (
                <p className="intel-message__pending" role="status">
                  Eleve IA está pensando…
                </p>
              )}
              {message.status === "propagating" && <p>{PROPAGATING_MESSAGE}</p>}
              {message.status === "error" && (
                <p className="notice notice--error" role="alert">
                  {message.errorMessage ?? "Não foi possível obter uma resposta agora. Tente novamente."}
                </p>
              )}
              {message.status === "insufficient" && (
                <>
                  <p className="intel-message__insufficient">{INSUFFICIENT_EVIDENCE_MESSAGE}</p>
                  {message.evidence && message.evidence.length > 0 && (
                    <SourceBadges evidence={message.evidence} onNavigateToPage={onNavigateToSource} />
                  )}
                </>
              )}
              {message.status === "answered" && (
                <>
                  <p>{message.answer}</p>
                  {message.evidence && message.evidence.length > 0 && (
                    <SourceBadges evidence={message.evidence} onNavigateToPage={onNavigateToSource} />
                  )}
                </>
              )}
            </div>
          ),
        )}
      </div>

      <form className="intel-chat__form" onSubmit={handleSubmit}>
        <label htmlFor="intel-question" className="sr-only">
          Pergunta sobre o documento
        </label>
        <input
          id="intel-question"
          type="text"
          className="intel-chat__input"
          placeholder="Pergunte algo sobre este documento…"
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          disabled={sending}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button
          type="submit"
          className="button button--primary intel-chat__send"
          disabled={sending || question.trim().length === 0}
          aria-label="Enviar pergunta"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
