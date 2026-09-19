import { afterEach, describe, expect, it, vi } from "vitest";
import { askLuna } from "../lunaClient";
import { LUNA_MAX_OUTPUT_TOKENS, LUNA_MODEL, LUNA_REASONING_EFFORT } from "../../../shared/intelligence/constants";

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );
}

function completedResponse(grounded: Record<string, unknown>, usage?: Record<string, unknown>) {
  return {
    id: "resp_test",
    status: "completed",
    output: [
      { id: "rs_1", type: "reasoning", content: [], summary: [] },
      {
        id: "msg_1",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(grounded) }],
      },
    ],
    usage,
  };
}

describe("askLuna", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("chama a Responses API com model/reasoning/store/tools corretos — modelo fixo, sem tools, store:false", async () => {
    mockFetchOnce(
      completedResponse({ answer: "Marina Costa.", evidenceIds: ["E1"], insufficientEvidence: false }),
    );

    await askLuna("sk-test", "Quem coordena o projeto?", [{ id: "E1", text: "A coordenadora é Marina Costa." }]);

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://api.openai.com/v1/responses");
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(LUNA_MODEL);
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.reasoning).toEqual({ effort: LUNA_REASONING_EFFORT });
    expect(body.reasoning.effort).toBe("low");
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(LUNA_MAX_OUTPUT_TOKENS);
    expect(body.tools).toBeUndefined();
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
  });

  it("nunca envia a chave no corpo da requisição, só no header Authorization", async () => {
    mockFetchOnce(completedResponse({ answer: "x", evidenceIds: [], insufficientEvidence: false }));
    await askLuna("sk-super-secret-value", "pergunta", [{ id: "E1", text: "evidência" }]);
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call[1] as RequestInit;
    expect(init.body as string).not.toContain("sk-super-secret-value");
  });

  it("retorna answer/evidenceIds/insufficientEvidence corretamente parseados", async () => {
    mockFetchOnce(
      completedResponse({ answer: "Marina Costa.", evidenceIds: ["E1"], insufficientEvidence: false }, {
        input_tokens: 120,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens: 40,
        output_tokens_details: { reasoning_tokens: 15 },
        total_tokens: 160,
      }),
    );

    const result = await askLuna("sk-test", "pergunta", [{ id: "E1", text: "evidência" }]);
    expect(result.answer).toEqual({ answer: "Marina Costa.", evidenceIds: ["E1"], insufficientEvidence: false });
    expect(result.usage).toEqual({
      inputTokens: 120,
      cachedInputTokens: 10,
      outputTokens: 40,
      reasoningTokens: 15,
      totalTokens: 160,
    });
  });

  it("usage ausente/parcial nunca é inventado — campos ficam null", async () => {
    mockFetchOnce(completedResponse({ answer: "x", evidenceIds: [], insufficientEvidence: true }));
    const result = await askLuna("sk-test", "pergunta", [{ id: "E1", text: "evidência" }]);
    expect(result.usage).toEqual({
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
    });
  });

  it("lança em resposta HTTP não-ok, sem propagar o corpo de erro da OpenAI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "detalhe interno sensível" } }), { status: 401 })),
    );
    await expect(askLuna("sk-test", "pergunta", [{ id: "E1", text: "x" }])).rejects.toThrow();
    try {
      await askLuna("sk-test", "pergunta", [{ id: "E1", text: "x" }]);
    } catch (err) {
      expect(String(err)).not.toContain("detalhe interno sensível");
    }
  });

  it("lança quando status não é completed (ex.: incomplete por max_output_tokens)", async () => {
    mockFetchOnce({ id: "resp_x", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] });
    await expect(askLuna("sk-test", "pergunta", [{ id: "E1", text: "x" }])).rejects.toThrow();
  });

  it("lança quando a saída só tem item reasoning, sem item message (achado real da auditoria)", async () => {
    mockFetchOnce({
      id: "resp_x",
      status: "completed",
      output: [{ id: "rs_1", type: "reasoning", content: [], summary: [] }],
    });
    await expect(askLuna("sk-test", "pergunta", [{ id: "E1", text: "x" }])).rejects.toThrow();
  });

  it("lança quando o texto da mensagem não é JSON válido", async () => {
    mockFetchOnce({
      id: "resp_x",
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "isso não é json" }] }],
    });
    await expect(askLuna("sk-test", "pergunta", [{ id: "E1", text: "x" }])).rejects.toThrow();
  });

  it("lança quando o JSON não corresponde ao schema esperado (campo faltando/tipo errado)", async () => {
    mockFetchOnce(completedResponse({ answer: "x", evidenceIds: "não é array", insufficientEvidence: false }));
    await expect(askLuna("sk-test", "pergunta", [{ id: "E1", text: "x" }])).rejects.toThrow();
  });

  it("lança quando a resposta vem completamente vazia (sem output)", async () => {
    mockFetchOnce({ id: "resp_x", status: "completed", output: [] });
    await expect(askLuna("sk-test", "pergunta", [{ id: "E1", text: "x" }])).rejects.toThrow();
  });
});
