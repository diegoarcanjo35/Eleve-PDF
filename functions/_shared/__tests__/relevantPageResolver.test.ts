import { describe, expect, it } from "vitest";
import { resolveRelevantPage } from "../relevantPageResolver";
import type { PageSpan } from "../../../shared/intelligence/types";

/** Monta chunkText + pageSpans a partir de um texto por página, com a
 * MESMA convenção de offset usada por `chunking.ts` (join por "\n",
 * startOffset inclusivo, endOffset exclusivo) — mas reimplementada aqui,
 * de propósito, para o teste do resolvedor não depender do chunker. */
function buildFixture(pageTexts: string[]): { chunkText: string; pageSpans: PageSpan[] } {
  const pageSpans: PageSpan[] = [];
  let offset = 0;
  const parts: string[] = [];
  pageTexts.forEach((text, i) => {
    const startOffset = offset;
    const endOffset = startOffset + text.length;
    pageSpans.push({ page: i + 1, startOffset, endOffset });
    parts.push(text);
    offset = endOffset + 1; // "\n"
  });
  return { chunkText: parts.join("\n"), pageSpans };
}

describe("resolveRelevantPage (Sprint 01L.1) — determinístico, conservador, sem IA", () => {
  it("8. caso obrigatório HZ-9274: termo distintivo exclusivo da página 3 → relevantPage = 3", () => {
    const { chunkText, pageSpans } = buildFixture([
      "Projeto Horizonte reune uma equipe multidisciplinar responsavel pela viabilidade tecnica.",
      "A primeira fase concentra-se no levantamento de requisitos funcionais do Projeto Horizonte.",
      "O codigo de homologacao do Projeto Horizonte e HZ-9274, usado nos testes de integracao.",
      "A fase final preve testes de aceitacao e estabilizacao do Projeto Horizonte.",
    ]);

    const relevantPage = resolveRelevantPage({
      question: "Qual é o código de homologação do Projeto Horizonte?",
      answer: "O código de homologação do Projeto Horizonte é HZ-9274.",
      chunkText,
      pageSpans,
    });

    expect(relevantPage).toBe(3);
  });

  it("9. expressão duplicada em duas páginas (2 e 3) → undefined, nunca escolhe uma das duas", () => {
    const { chunkText, pageSpans } = buildFixture([
      "Introdução geral do documento, sem nenhum valor específico mencionado aqui.",
      "O valor de referência acordado é R$ 12.345,00 conforme consta neste trecho.",
      "Reafirmamos que o valor de referência acordado é R$ 12.345,00 nesta segunda menção.",
      "Considerações finais do documento, sem repetir nenhum valor citado antes.",
    ]);

    const relevantPage = resolveRelevantPage({
      question: "Qual é o valor de referência acordado?",
      answer: "O valor de referência acordado é R$ 12.345,00.",
      chunkText,
      pageSpans,
    });

    expect(relevantPage).toBeUndefined();
  });

  it("10. paráfrase sem termo distintivo em comum com o documento → undefined", () => {
    const { chunkText, pageSpans } = buildFixture([
      "Página um com conteúdo introdutório qualquer, sem relação com a resposta.",
      "Página dois também sem relação direta com o que foi perguntado.",
      "O prazo definido internamente para a etapa é de sessenta dias corridos.",
      "Página quatro encerra o documento sem mais detalhes relevantes.",
    ]);

    // Resposta parafraseada, sem nenhuma palavra igual à do documento.
    const relevantPage = resolveRelevantPage({
      question: "Quanto tempo dura a etapa?",
      answer: "Cerca de dois meses.",
      chunkText,
      pageSpans,
    });

    expect(relevantPage).toBeUndefined();
  });

  it("11. sinais conflitantes (dois termos distintivos, cada um exclusivo de uma página diferente) → undefined", () => {
    const { chunkText, pageSpans } = buildFixture([
      "Primeira página do documento, contexto geral do projeto Aurora Beta.",
      "O responsável técnico pela etapa inicial é identificado como Coordenador Alfabravo.",
      "O responsável técnico pela etapa final é identificado como Coordenador Zetacharlie.",
      "Encerramento do documento, sem novas atribuições de responsabilidade.",
    ]);

    // A resposta cita os dois nomes — um exclusivo da página 2, outro da 3 —
    // sinal contraditório, nunca deve escolher arbitrariamente uma das duas.
    const relevantPage = resolveRelevantPage({
      question: "Quem são os responsáveis técnicos?",
      answer: "Coordenador Alfabravo e Coordenador Zetacharlie.",
      chunkText,
      pageSpans,
    });

    expect(relevantPage).toBeUndefined();
  });

  it("12. ausência total de match (pageSpans vazio) → undefined", () => {
    const relevantPage = resolveRelevantPage({
      question: "Qual é o código de homologação?",
      answer: "HZ-9274.",
      chunkText: "qualquer coisa",
      pageSpans: [],
    });
    expect(relevantPage).toBeUndefined();
  });

  it("chunk legado sem pageSpans (undefined) → undefined, nunca lança", () => {
    expect(() =>
      resolveRelevantPage({ question: "q", answer: "a", chunkText: "texto", pageSpans: undefined }),
    ).not.toThrow();
    expect(
      resolveRelevantPage({ question: "q", answer: "a", chunkText: "texto", pageSpans: undefined }),
    ).toBeUndefined();
  });

  it("13. chunk de uma página só (todos os spans apontam pra mesma página) → resolve trivialmente para ela", () => {
    const { chunkText, pageSpans } = buildFixture(["Texto inteiro contido numa única página, sem cruzar nada."]);
    const relevantPage = resolveRelevantPage({
      question: "irrelevante",
      answer: "irrelevante",
      chunkText,
      pageSpans,
    });
    expect(relevantPage).toBe(1);
  });

  it("spans malformados (offset fora dos limites) são ignorados com segurança, sem lançar", () => {
    const chunkText = "texto curto";
    const pageSpans: PageSpan[] = [
      { page: 1, startOffset: -5, endOffset: 3 }, // negativo — descartado
      { page: 2, startOffset: 0, endOffset: 999 }, // além do tamanho do texto — descartado
    ];
    expect(() => resolveRelevantPage({ question: "q", answer: "a", chunkText, pageSpans })).not.toThrow();
    expect(resolveRelevantPage({ question: "q", answer: "a", chunkText, pageSpans })).toBeUndefined();
  });
});
