import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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

/** Sugestões genéricas, úteis para qualquer tipo de documento — nunca
 * assumem que o PDF é um contrato, nunca prometem funcionalidade que ainda
 * não existe (ex.: nada de "compare com outro documento"). Mostradas só
 * antes da primeira pergunta (ver `messages.length === 0` abaixo). */
const QUICK_ACTIONS = [
  "Resuma este documento",
  "Quais são os pontos principais?",
  "Encontre datas importantes",
  "Quais valores aparecem no documento?",
] as const;

/**
 * Chat da Eleve IA — histórico só em memória (não é conversa multi-turno no
 * backend: cada pergunta chega isolada ao `/ask`, ver `useIntelligenceSession`).
 * O histórico visual existe só para a experiência do usuário nesta aba,
 * nunca é enviado de volta como contexto.
 */
export function ChatPanel({ messages, onSend, onNavigateToSource, sending }: ChatPanelProps) {
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Leva o foco direto para o campo de pergunta assim que o chat fica
  // disponível (o próprio ChatPanel só existe quando `stage === "ready"`) —
  // ajuda quem navega por teclado/leitor de tela a não precisar procurar.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** Único caminho de envio — usado tanto pelo submit do form (clique no
   * botão ou Enter nativo) quanto pelo atalho de teclado abaixo, para que
   * "Enter" e "clique" sejam garantidamente a mesma função. */
  const trySend = () => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setQuestion("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    trySend();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    // Sempre previne o Enter nativo do form (mesmo com Shift) — assim
    // Shift+Enter nunca dispara envio, independente do comportamento padrão
    // do navegador para um <input> de linha única dentro de um <form>.
    event.preventDefault();
    if (event.shiftKey) return;
    trySend();
  };

  const handleQuickAction = (text: string) => {
    if (sending) return;
    onSend(text);
  };

  return (
    <div className="intel-chat">
      <div className="intel-chat__messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="intel-chat__empty">
            <p>Faça uma pergunta sobre o conteúdo deste documento para começar.</p>
            <div className="intel-chat__quick-actions">
              {QUICK_ACTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="intel-chat__quick-action"
                  onClick={() => handleQuickAction(text)}
                  disabled={sending}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
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
          ref={inputRef}
          id="intel-question"
          type="text"
          className="intel-chat__input"
          placeholder="Pergunte algo sobre este documento…"
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          disabled={sending}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
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
