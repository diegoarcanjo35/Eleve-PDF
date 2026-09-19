# ADR 0001 — RAG desacoplado de fornecedor

**Status**: Aceito (fundação arquitetural, Fase 00)
**Data**: Fase 00 — Fundação da Inteligência Documental

## Contexto

A Inteligência Documental depende de LLMs, embeddings e, futuramente, OCR
— todos fornecidos por serviços externos. O produto comercial é "Créditos
Eleve IA": o usuário compra capacidade de uso do ElevePDF, não um
fornecedor específico de IA. Diferentes categorias de tarefa (classificação,
pergunta simples, resumo, análise profunda, etc. — ver blueprint técnico,
seção 5) têm perfis de custo/capacidade muito diferentes, e modelos
econômicos podem atender bem tarefas simples enquanto modelos mais caros
são reservados para análises complexas.

## Decisão

O pipeline de RAG (extração → chunking → embeddings → índice vetorial →
retrieval → LLM → resposta) e o roteamento de tarefas de IA serão
desenhados desde o início sem acoplamento direto do código de produto a
um fornecedor específico (OpenAI, Anthropic, Google, ou qualquer outro).
Nenhum SDK de fornecedor é integrado nesta fase — esta é uma decisão sobre
a *forma* da arquitetura-alvo, não uma implementação.

## Consequências

- Positivas: permite trocar ou combinar fornecedores por categoria de
  tarefa sem reescrever o produto; alinha com o modelo comercial de
  "Créditos Eleve IA" em vez de assinatura de um fornecedor específico;
  facilita o benchmark econômico comparativo (`04-creditos-economia-ia.md`).
- Negativas / custo: uma camada de abstração adicional tem custo de
  desenho e manutenção comparado a integrar diretamente com um único SDK;
  a primeira integração real (Fase 01 ou posterior) precisará provar que a
  abstração escolhida realmente cobre as diferenças reais entre
  fornecedores (streaming, formatos de tool-use, limites de contexto),
  não apenas assumir isso em teoria.
- Não decidido por este ADR: qual(is) fornecedor(es) serão integrados
  primeiro, nem o desenho concreto da interface de roteamento — isso fica
  para quando a primeira integração real for autorizada.
