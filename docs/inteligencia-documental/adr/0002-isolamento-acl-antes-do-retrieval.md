# ADR 0002 — Isolamento/ACL antes do retrieval

**Status**: Aceito (fundação arquitetural, Fase 00)
**Data**: Fase 00 — Fundação da Inteligência Documental

## Contexto

A busca semântica (pilar "Encontrar") e a conversa com a biblioteca
(pilar "Conversar", funcionalidade D) recuperam conteúdo de múltiplos
documentos por similaridade vetorial. Sem uma garantia arquitetural, é
tecnicamente possível que uma busca vetorial recupere chunks de documentos
que o usuário autenticado não tem permissão de ver, e que esse conteúdo
chegue ao contexto do LLM e, por extensão, à resposta exibida — um
vazamento de dados entre usuários/organizações via um caminho que não é o
de acesso direto ao documento.

## Decisão

O fluxo de retrieval segue obrigatoriamente a ordem:

```
autorização → escopo de retrieval → recuperação → composição do contexto → LLM
```

Nunca a ordem inversa (retrieval global seguido de filtro). O filtro de
autorização é aplicado **na construção da própria busca** (a query
vetorial já nasce escopada ao conjunto de documentos que o usuário pode
acessar), não como um passo de pós-processamento sobre um resultado já
recuperado sem escopo. Ver `03-seguranca-privacidade-isolamento.md`, seção
4, para os riscos específicos que esta decisão mitiga (vazamento entre
tenants, recuperação sem ACL, exfiltração por perguntas indiretas).

## Consequências

- Positivas: elimina uma classe inteira de vulnerabilidade por desenho,
  em vez de depender de disciplina de código em cada novo endpoint de
  busca; torna a checagem de autorização testável isoladamente do
  comportamento do LLM.
- Negativas / custo: exige que qualquer solução de índice vetorial
  escolhida (decisão em aberto, item 3) suporte filtro por metadado de
  propriedade/permissão na própria consulta — isso é um critério de
  seleção da solução vetorial, não um detalhe posterior; restringe
  algumas otimizações de cache de busca que assumiriam resultados
  compartilháveis entre usuários.
- Não decidido por este ADR: o mecanismo concreto de ACL (RBAC completo
  vs. dono único simplificado na Fase 01) — apenas o *ponto* no fluxo em
  que a checagem acontece, que é invariante desde a Fase 01 mesmo que a
  sofisticação da checagem cresça depois (ver modelo de dados, seção 2,
  `document_permissions`).
