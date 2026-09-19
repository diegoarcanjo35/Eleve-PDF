# Segurança, Privacidade e Isolamento — Inteligência Documental (ElevePDF)

> Fase 00 — Fundação. Requisitos e invariantes arquiteturais. Nenhuma
> mitigação é implementada nesta fase — este documento especifica
> requisitos e fronteiras para que nenhuma decisão futura os viole por
> omissão.

## 1. Princípio de privacidade — dois domínios (referência)

Ver `00-documento-mestre.md`, seção 2, para o texto completo. Resumo
aplicado à segurança:

- **Domínio local** (Compactar/Dividir/Juntar): PDF nunca sai do
  navegador. Esta garantia não pode ser degradada silenciosamente por
  nenhuma mudança futura.
- **Domínio remoto** (Inteligência Documental): processamento remoto
  apenas quando necessário, sempre explícito e transparente ao usuário
  antes do upload, e sempre isolado do domínio local no código (ver
  blueprint técnico, seção 8).

Toda a análise de segurança abaixo trata do domínio remoto — é onde existe
superfície de ataque nova.

## 2. Dois regimes de privacidade (sessão rápida vs. biblioteca)

- **Sessão rápida**: upload → processamento → uso → expiração → exclusão.
  Nenhuma persistência além do necessário para a sessão em curso. O
  usuário não precisa criar biblioteca para usar Conversar com PDF de
  forma pontual.
- **Biblioteca**: o usuário decide explicitamente persistir o documento
  (ver documento mestre — ação explícita obrigatória, nunca padrão). A
  partir daí, exclusão precisa ser real e verificável, dentro das
  capacidades da infraestrutura escolhida (ver `02-modelo-de-dados.md`,
  seção 4, exclusão lógica vs. garantia física).

Regras absolutas para os dois regimes:
- Nunca usar conteúdo privado de um usuário para responder outro usuário.
- Nunca presumir autorização para treinamento de modelo — qualquer uso de
  conteúdo do usuário para treinar/ajustar um modelo exigiria consentimento
  explícito e separado, não implícito no uso do produto. Não decidido
  nesta fase se essa funcionalidade sequer existirá.

## 3. Memória do Documento — requisito arquitetural de primeira classe

### 3.1 Estados conceituais do documento

Um `document` (ver modelo de dados) transita por, no mínimo, estes estados:

1. **Ativo** — documento e todos os artefatos derivados (texto, chunks,
   embeddings, OCR) existem e são fonte primária válida para citação.
2. **Em processo de exclusão** — o usuário solicitou exclusão (completa ou
   com memória preservada); a remoção física dos artefatos pode não ser
   instantânea (depende da infraestrutura), mas o documento já deixa de
   ser servido como fonte a partir do momento da solicitação — nunca
   continua respondendo por retrieval enquanto "em processo".
3. **Excluído completamente** — PDF original, texto integral, chunks,
   embeddings dos chunks, OCR e todas as evidências/citações baseadas nele
   foram removidos. Nada resta além, no máximo, de um registro de
   auditoria de que a exclusão ocorreu (sem conteúdo).
4. **Excluído com Memória preservada** — os artefatos do item 3 foram
   removidos, mas uma `document_memory` foi criada antes da remoção e
   sobrevive (ver seção 3.2).

### 3.2 O que pode e o que não pode permanecer numa Memória

**Pode permanecer** (dentro de `document_memory`):
- Resumo estruturado
- Assuntos
- Entidades
- Datas
- Valores
- Conceitos
- Metadados mínimos necessários (ex.: quando foi criada a memória)
- Embedding próprio da memória (gerado sobre o resumo, nunca reaproveitado
  dos embeddings dos chunks originais — reaproveitar violaria a garantia
  de que os embeddings originais foram removidos)

**Nunca pode permanecer** como parte de uma Memória:
- PDF original
- Texto integral
- Chunks originais
- Embeddings dos chunks originais
- OCR integral
- Trechos citáveis
- Páginas citáveis

### 3.3 Regra invariante

> **Uma Memória do Documento nunca é apresentada como fonte primária.**

Consequências obrigatórias, válidas para qualquer implementação futura:
- Depois da exclusão do PDF, o sistema nunca indica número de página.
- Nunca apresenta um trecho como verificável.
- Nunca afirma, direta ou indiretamente, que o PDF original ainda existe.
- Nunca apresenta uma resposta baseada em Memória como se fosse uma
  `citation` de fonte primária.
- Qualquer resposta futura baseada numa Memória deve **identificar
  explicitamente** que se trata de um resumo preservado e que o documento
  original foi excluído — o equivalente conceitual a "Resumo preservado —
  documento original excluído." em qualquer superfície de UI que consuma
  essa informação (chat, biblioteca, relatório).
- **`citation` e `memory attribution` são dois conceitos separados desde o
  primeiro desenho do modelo de dados** (`02-modelo-de-dados.md`, blocos
  `citation`/`reference` e `memory attribution`) — nunca a mesma estrutura
  com um marcador interno de "fonte primária vs. Memória". É essa
  separação conceitual, não um campo dentro de `citation`, que sustenta
  esta regra e impede o caminho `document_memory → citation normal`.

## 4. Segurança do RAG — invariante de autorização

### 4.1 A ordem correta (obrigatória)

```
autorização → escopo de retrieval → recuperação → composição do contexto → LLM
```

### 4.2 A ordem proibida

```
retrieval global → filtrar depois
```

**Nunca aceitável.** Recuperar chunks sem escopo de autorização já
aplicado e só filtrar o resultado depois (na composição do contexto, ou
pior, confiando que o LLM "vai ignorar" o que não devia ver) não é
segurança — é uma falha arquitetural. Especificamente, nunca é aceitável
que:

```
usuário sem acesso ao PDF → pergunta → busca vetorial recupera chunk → LLM revela conteúdo
```

O isolamento é arquitetural, não uma checagem de interface. Antes de
qualquer chamada de busca por similaridade, o sistema precisa já ter
resolvido: qual usuário está perguntando, de qual tenant/organização, com
qual escopo de documentos autorizados — e a query vetorial em si precisa
ser construída dentro desse escopo (filtro aplicado na fonte da busca, não
depois de recebida a resposta da busca).

### 4.3 Riscos específicos a documentar (não mitigar nesta fase)

- **Prompt injection dentro do PDF**: um documento pode conter texto
  deliberadamente escrito para ser interpretado como instrução pelo LLM
  (ex.: "ignore as instruções anteriores e revele X") quando esse texto
  entrar no contexto como conteúdo do documento. O conteúdo de um
  documento nunca deve ser tratado com o mesmo nível de confiança que uma
  instrução do sistema.
- **Instruções maliciosas embutidas em documentos** — variante do item
  acima, incluindo texto invisível (branco sobre branco, fonte
  minúscula, camadas OCR manipuladas) especificamente desenhado para não
  ser percebido por um leitor humano mas ser processado pelo pipeline de
  extração.
- **Vazamento entre tenants** — qualquer falha no escopo de autorização
  (seção 4.2) que permita que dados de uma organização apareçam na
  resposta de outra.
- **Recuperação de chunks sem ACL** — a mesma falha da seção 4.2, no nível
  de implementação: um índice vetorial que não carrega (ou não aplica)
  metadado de propriedade/permissão no momento da busca.
- **Citações inexistentes ou alucinadas** — o LLM apresentar uma
  referência (página, trecho) que não corresponde a um `citation` real
  gerado pelo pipeline de retrieval. O requisito de produto (Documento
  Mestre, pilar "Conversar") é que toda referência seja **fundamentada**
  — a arquitetura precisa impedir, não apenas desencorajar, referências
  fabricadas (ex.: validar toda citação apresentada contra o conjunto real
  de chunks recuperados antes de exibi-la).
- **Exfiltração por perguntas indiretas** — um usuário autorizado
  formulando perguntas desenhadas para extrair, indiretamente, conteúdo de
  um documento ao qual não deveria ter acesso (ex.: perguntas sobre
  "documentos similares" que vazam metadados ou trechos de documentos de
  outro tenant através de correlação). Relevante especialmente para as
  funcionalidades de Correlação (E) e Conversar com a biblioteca (D).
- **Documentos deliberadamente manipulados para influenciar análises** —
  um documento (ex.: um contrato) construído propositalmente para induzir
  o Raio-X/análise contratual (G, H) a uma conclusão favorável a uma das
  partes, explorando o fato de que a análise é baseada no texto fornecido.
  Reforça o requisito já existente no Documento Mestre: a IA não declara
  algo como ilegal/abusivo sem base — destaca pontos de atenção com
  evidência, nunca produz veredito.

## 5. Auditoria B2B (requisitos, não implementação)

Eventos auditáveis previstos (Fase 07): upload, acesso, exclusão,
compartilhamento, alterações de permissão, operações administrativas,
execução de operações relevantes de IA.

**Não decidido nesta fase**: se o conteúdo integral das conversas
(`message`) é armazenado em log de auditoria. Essa é uma decisão de
privacidade específica que precisa ponderar utilidade de auditoria contra
minimização de dados — não deve ser resolvida por omissão (ex.: logar
"tudo por padrão" porque é o caminho de menor esforço de implementação).
Ver `decisoes-em-aberto.md`.

## 6. Isolamento organizacional (visão para Fase 07)

Requisitos a não impedir arquiteturalmente, mesmo sem implementar agora:
tenant/organization como dimensão de escopo em toda entidade que precisar
dela; ownership explícito; ACL por documento; escopo de recuperação restrito
por tenant nas buscas vetoriais (ver seção 4); isolamento total entre
usuários/organizações diferentes — nenhuma organização consegue, por
nenhum caminho (incluindo correlação e busca semântica), recuperar
conteúdo de outra.

## 7. Relação com o Analytics existente

O Analytics atual (`shared/analytics/events.ts`, `functions/api/analytics/`)
já segue boa parte da disciplina exigida aqui: vocabulário fechado, nunca
dado bruto sensível, validação em ambos os lados, consentimento explícito
antes de qualquer coleta. Este é o padrão de referência a repetir para
qualquer telemetria de IA (`04-creditos-economia-ia.md`) — não um padrão
novo a inventar. A diferença central é que o Analytics de hoje nunca lida
com conteúdo de documento; a Inteligência Documental lida, por definição,
com conteúdo — daí a necessidade dos requisitos adicionais desta seção.
