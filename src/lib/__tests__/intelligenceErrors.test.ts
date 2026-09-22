import { describe, expect, it } from "vitest";
import { IntelligenceHttpError, friendlyIntelligenceErrorMessage } from "../intelligenceErrors";

describe("IntelligenceHttpError", () => {
  it("carrega o status HTTP e nunca expõe detalhes internos na mensagem", () => {
    const error = new IntelligenceHttpError(503, "Falha ao criar sessão temporária (status 503).");
    expect(error.status).toBe(503);
    expect(error.name).toBe("IntelligenceHttpError");
    expect(error.message).not.toMatch(/openai|luna|d1|vectorize|provider|cloudflare/i);
  });
});

describe("friendlyIntelligenceErrorMessage", () => {
  it("410 (asking) orienta a trocar de documento, sem termos técnicos", () => {
    const message = friendlyIntelligenceErrorMessage(410, "asking");
    expect(message).toMatch(/expirou/i);
    expect(message).toMatch(/trocar documento/i);
  });

  it("410 (preparing) orienta a selecionar o PDF novamente", () => {
    const message = friendlyIntelligenceErrorMessage(410, "preparing");
    expect(message).toMatch(/expirou/i);
    expect(message).toMatch(/selecione o pdf/i);
  });

  it("429 explica limite de solicitações, não culpa o usuário", () => {
    const message = friendlyIntelligenceErrorMessage(429, "asking");
    expect(message).toMatch(/muitas solicitações/i);
  });

  it("502 e 503 caem na mesma mensagem de indisponibilidade temporária", () => {
    expect(friendlyIntelligenceErrorMessage(502, "asking")).toMatch(/indisponível/i);
    expect(friendlyIntelligenceErrorMessage(503, "asking")).toMatch(/indisponível/i);
  });

  it("status desconhecido/ausente cai no fallback genérico por contexto", () => {
    expect(friendlyIntelligenceErrorMessage(undefined, "asking")).toMatch(/não foi possível obter uma resposta/i);
    expect(friendlyIntelligenceErrorMessage(500, "preparing")).toMatch(/não foi possível preparar/i);
  });

  it("nenhuma mensagem menciona provider, banco, stack ou termos internos", () => {
    const statuses = [410, 429, 502, 503, 500, undefined];
    for (const status of statuses) {
      for (const context of ["preparing", "asking"] as const) {
        const message = friendlyIntelligenceErrorMessage(status, context);
        expect(message).not.toMatch(/openai|luna|workers ai|d1|vectorize|provider|stack|capability/i);
      }
    }
  });
});
