import { clearSessionState } from "./session";

export type ConsentState = "unset" | "accepted" | "declined";

const STORAGE_KEY = "elevepdf.analytics.consent";

type Listener = () => void;
const listeners = new Set<Listener>();

function readConsentFromStorage(): ConsentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "accepted" || raw === "declined") return raw;
    return "unset";
  } catch {
    // localStorage indisponível (ex.: navegação privada com bloqueio total) —
    // trata como "unset"/não aceito, nunca assume consentimento por falha técnica.
    return "unset";
  }
}

let currentConsent: ConsentState = typeof window !== "undefined" ? readConsentFromStorage() : "unset";

export function getConsent(): ConsentState {
  return currentConsent;
}

export function setConsent(next: "accepted" | "declined"): void {
  currentConsent = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Se não for possível persistir, a escolha ainda vale para esta sessão em
    // memória — só não sobrevive a um reload. Não interrompe a UI por isso.
  }
  if (next === "declined") {
    // Revogação: interrompe o envio (já garantido por `track()` checar
    // `getConsent()`) e limpa a sessão pseudônima e a atribuição já
    // capturadas — uma aceitação futura sempre começa uma sessão nova.
    clearSessionState();
  }
  listeners.forEach((listener) => listener());
}

export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Só para testes: volta o estado em memória para "unset" (não mexe em localStorage). */
export function __resetConsentForTests(): void {
  currentConsent = "unset";
}
