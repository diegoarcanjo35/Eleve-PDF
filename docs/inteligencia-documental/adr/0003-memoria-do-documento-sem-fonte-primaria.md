# ADR 0003 — Memória do Documento sem fonte primária

**Status**: Aceito (fundação arquitetural, Fase 00)
**Data**: Fase 00 — Fundação da Inteligência Documental

## Contexto

Quando um usuário exclui um PDF da biblioteca, ele pode optar por manter
um resumo estruturado ("Memória do Documento") em vez de perder toda
referência ao que o documento continha. Sem uma regra explícita, existe
risco real de essa Memória ser tratada, por engano ou por simplificação de
implementação futura, como se ainda fosse o documento original — citando
página, apresentando trechos como verificáveis, ou simplesmente não
deixando claro que o PDF não existe mais. Isso violaria a confiança do
usuário na promessa de exclusão real.

## Decisão

Uma Memória do Documento **nunca é apresentada como fonte primária**, em
nenhuma circunstância. Especificamente (ver
`03-seguranca-privacidade-isolamento.md`, seção 3.3):

- Nunca indica número de página.
- Nunca apresenta trecho como verificável.
- Nunca afirma que o documento original ainda existe.
- Nunca é apresentada como `citation` de fonte primária para documento
  excluído — uma resposta baseada em Memória é referenciada por um
  conceito distinto, `memory attribution` (ver modelo de dados), nunca
  por `citation`.
- Toda resposta baseada em Memória identifica explicitamente essa
  condição para o usuário.

A Memória em si nunca contém PDF original, texto integral, chunks
originais, embeddings dos chunks originais, OCR integral, ou qualquer
trecho/página citável — apenas resumo estruturado, assuntos, entidades,
datas, valores, conceitos, metadados mínimos, e um embedding próprio
gerado sobre o resumo (nunca reaproveitado dos embeddings originais).

## Consequências

- Positivas: a promessa de privacidade ("excluir de verdade") permanece
  verdadeira mesmo quando o usuário opta por manter algum valor do
  documento; a distinção fonte-primária-vs-memória é conceitual desde o
  desenho inicial — `citation` (fonte primária) e `memory attribution`
  (Memória) são dois conceitos separados no modelo de dados
  (`02-modelo-de-dados.md`), nunca a mesma estrutura com um marcador
  interno — evitando que a distinção seja esquecida numa implementação
  apressada depois.
- Negativas / custo: reduz a utilidade da Memória comparado a manter o
  documento completo (por desenho, é uma escolha deliberada em favor de
  privacidade sobre utilidade); exige que o pipeline de exclusão gere a
  Memória *antes* de remover os artefatos originais, criando uma ordem de
  operações que precisa ser respeitada por qualquer implementação futura
  do fluxo de exclusão.
- Não decidido por este ADR: o formato exato do resumo estruturado, nem
  como/quando o usuário é convidado a escolher entre exclusão completa e
  exclusão-com-memória.
