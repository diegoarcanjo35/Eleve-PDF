import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categorizeIntelligenceErrorStatus,
  logIntelligenceError,
  logIntelligenceOutcome,
} from "../intelligenceTelemetry";

describe("categorizeIntelligenceErrorStatus (Sprint 01P)", () => {
  it("mapeia cada status conhecido para sua categoria fechada", () => {
    expect(categorizeIntelligenceErrorStatus(400)).toBe("invalid_request");
    expect(categorizeIntelligenceErrorStatus(401)).toBe("unauthorized");
    expect(categorizeIntelligenceErrorStatus(403)).toBe("forbidden");
    expect(categorizeIntelligenceErrorStatus(404)).toBe("not_found");
    expect(categorizeIntelligenceErrorStatus(409)).toBe("conflict");
    expect(categorizeIntelligenceErrorStatus(410)).toBe("expired");
    expect(categorizeIntelligenceErrorStatus(413)).toBe("payload_too_large");
    expect(categorizeIntelligenceErrorStatus(415)).toBe("unsupported_media_type");
    expect(categorizeIntelligenceErrorStatus(429)).toBe("rate_limited");
    expect(categorizeIntelligenceErrorStatus(500)).toBe("internal");
    expect(categorizeIntelligenceErrorStatus(502)).toBe("provider_error");
    expect(categorizeIntelligenceErrorStatus(503)).toBe("unavailable");
  });

  it("status desconhecido cai no fallback conservador 'internal', nunca lança", () => {
    expect(() => categorizeIntelligenceErrorStatus(418)).not.toThrow();
    expect(categorizeIntelligenceErrorStatus(418)).toBe("internal");
  });
});

describe("logIntelligenceError / logIntelligenceOutcome — conteúdo do log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rate-limit acionado (429) é logado com a categoria correta", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logIntelligenceError({ route: "ask", status: 429 });
    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain('"type":"intelligence_error"');
    expect(logged).toContain('"route":"ask"');
    expect(logged).toContain('"status":429');
    expect(logged).toContain('"category":"rate_limited"');
  });

  it("insufficientEvidence é logado no evento de desfecho", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logIntelligenceOutcome({ route: "ask", insufficientEvidence: true, indexStatus: "settled" });
    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain('"type":"intelligence_outcome"');
    expect(logged).toContain('"insufficientEvidence":true');
    expect(logged).toContain('"indexStatus":"settled"');
  });

  it("possibly_propagating é logado no evento de desfecho", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logIntelligenceOutcome({ route: "ask", indexStatus: "possibly_propagating" });
    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain('"indexStatus":"possibly_propagating"');
  });

  it("nenhum log de erro/desfecho contém pergunta, resposta, texto, capability ou sessionId", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logIntelligenceError({ route: "ingest", status: 410 });
    logIntelligenceOutcome({ route: "ask", insufficientEvidence: false, indexStatus: "settled" });
    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toMatch(/pergunta|resposta|capability|sessionId|Bearer/i);
  });
});
