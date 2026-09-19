# Modelo de Dados Inicial — Inteligência Documental (ElevePDF)

> Fase 00 — Fundação. **Nenhum SQL, nenhuma migration, nenhuma tabela
> criada nesta fase.** Este documento é o modelo conceitual/lógico —
> entidades, atributos-chave e relações — para orientar o desenho real
> quando cada fase for autorizada. Nomes de entidade são provisórios, não
> nomes finais de tabela/coluna.

## 1. Critério de classificação

Cada entidade é classificada em uma das três categorias, para evitar
reservar estrutura prematuramente:

- **Fase 01** — necessária para a primeira fatia vertical (Conversar com
  PDF, sessão rápida, documento único, sem biblioteca persistente).
- **Fase futura identificada** — necessária, mas só a partir de uma fase
  específica do roadmap (indicada por entidade).
- **Conceitual/possível** — existe na visão de produto, mas não tem uso
  concreto definido ainda; não deve ser criada até que uma fase real a
  exija. Listada aqui só para não ser esquecida no desenho de longo prazo.

## 2. Entidades

### `document` — Fase 01
O PDF (ou sua representação processada) dentro do domínio remoto. Um
`document` só existe se o usuário optou explicitamente por processamento
remoto (ver princípio de dois domínios) — nunca é criado como efeito
colateral de usar Compactar/Dividir/Juntar.
Atributos-chave conceituais: identificador, dono (usuário/organização),
estado (ativo / em exclusão / excluído / excluído-com-memória — ver
`03-seguranca-privacidade-isolamento.md`), metadados mínimos (nome,
tamanho, contagem de páginas, data de upload), ponteiro para o artefato
bruto (localização de armazenamento, ainda não decidida).

### `document_version` — Fase futura identificada (Fase 04, Correlação/Comparação)
Existe **separado** de `document` desde o desenho conceitual, mesmo que só
seja materializado na Fase 04 — comparação e evolução entre versões
dependem de um histórico versionado, e misturar essa ideia dentro de
`document` desde o início criaria acoplamento difícil de desfazer depois.
Atributos-chave conceituais: referência ao `document` "família", número/
rótulo de versão, timestamp, relação com a versão anterior.

### `document_permissions` — Fase 07 (Business/RBAC), mas o *princípio* de
autorização é requisito desde a Fase 01
Mesmo em uso individual (sem organização), o retrieval de um documento
precisa checar propriedade antes de qualquer busca — o requisito de
segurança (`03-seguranca-privacidade-isolamento.md`, invariante de RAG) é
válido desde o primeiro documento, mesmo que a tabela de permissões
granulares (compartilhamento, papéis) só ganhe forma real na Fase 07.
Fase 01 pode resolver "autorização" com a regra mais simples possível
(dono = único autorizado), desde que o *ponto de verificação* no fluxo já
exista — não é aceitável adiar o "onde" a checagem acontece, só o "quão
sofisticada" ela é.

### `document_processing_job` — Fase 01
Unidade de trabalho assíncrona (extração, chunking, embeddings, OCR).
Atributos-chave conceituais: referência ao `document`, tipo de operação,
estado (pendente/em progresso/concluído/erro), timestamps, erro
estruturado quando aplicável.

### `document_pages` — estrutura opcional/futura (Fase 01 tardia ou Fase 02,
dependendo de quão cedo a navegação "clicar na referência → ir à página"
ganhar uma indexação própria por página)
Mapeamento **dedicado** página → posição/conteúdo, consultável
independentemente de qualquer chunk específico — útil, por exemplo, para
abrir diretamente uma página sem antes precisar localizar um chunk que a
referencie. **Não é exigida como tabela/entidade própria na Fase 01.**
Importante: a ausência de `document_pages` como estrutura própria **não
dispensa** `document_chunk` (abaixo) de já carregar proveniência de página
suficiente por si só — ver o requisito invariante no bloco seguinte.
Quando `document_pages` existir, ela pode se tornar uma forma mais rica ou
normalizada de indexar essa mesma proveniência; ela não é a origem dela.

### `document_chunk` — Fase 01
A unidade recuperável pelo RAG. **Distinta de `document_pages`**: um chunk
carrega texto + proveniência de origem, mas seu tamanho/estratégia de
corte é uma decisão de implementação da Fase 01, não desta fase.

**Requisito invariante desde a Fase 01** (independente de `document_pages`
existir como entidade própria): todo `document_chunk` deve carregar ou
referenciar proveniência **determinística** suficiente para determinar sua
página de origem no PDF — nunca uma proveniência aproximada, estimada, ou
reconstruída a posteriori tentando reabrir/reprocessar o documento. O
objetivo do fluxo é:

```
PDF → extração com proveniência → chunk → retrieval → evidência → página original
```

A futura navegação "clicar na fonte → abrir a página correspondente"
precisa poder resolver a página **só com o que já foi gravado no momento
da extração/chunking** — nunca depender de reprocessar o PDF ou de
inferir a origem depois do fato. O mecanismo concreto de como essa
proveniência é carregada (um campo de página no próprio chunk, uma
referência a um índice de posições gerado no mesmo passo de extração, ou
outro) é decisão de implementação da Fase 01, não desta fase — o que é
invariante é que a garantia exista desde o primeiro desenho do pipeline de
extração/chunking, não que seja adicionada depois.

Atributos-chave conceituais: referência ao `document`, texto, proveniência
de origem (página — obrigatória, ver requisito acima — e seção quando
identificável), referência ao embedding correspondente.
**Regra de exclusão**: um `document_chunk` é excluído junto com o
`document` que o originou. Nunca sobrevive à exclusão do documento — ver
seção 4.

### `document_topics` — Fase futura identificada (Fase 02, Biblioteca
Inteligente)
Assuntos identificados automaticamente, usados para organização da
biblioteca e correlação.

### `document_relations` — Fase futura identificada (Fase 04, Correlação)
Relação entre dois `document` por assunto/entidade/conceito/versão/
similaridade. Não é o mesmo conceito que `document_version` — uma relação
de correlação não implica linhagem/versionamento.

### `document_memory` — Fase futura identificada (Fase 02, Biblioteca
Inteligente + Memória do Documento), mas **desenhada como requisito
arquitetural desde a Fase 00** por exigência explícita do PO
O que sobrevive à exclusão de um `document` quando o usuário optar por
"excluir PDF e guardar resumo", em vez de exclusão completa.
Atributos-chave conceituais: referência ao `document` original (mantida
apenas para rastreabilidade interna de que existiu — nunca usada para
reconstituir conteúdo), resumo estruturado, assuntos, entidades, datas,
valores, conceitos, metadados mínimos necessários, embedding próprio da
memória (gerado sobre o resumo, não sobre os chunks originais).
**Nunca contém**: texto integral, chunks originais, embeddings dos chunks
originais, OCR integral, trechos citáveis, páginas citáveis — ver seção 4
e `03-seguranca-privacidade-isolamento.md`. Qualquer resposta baseada em
`document_memory` é referenciada por `memory attribution` (bloco abaixo),
nunca por `citation`.

### `citation` / `reference` — Fase 01
Representa evidência **verificável**, proveniente de uma fonte primária
que ainda existe (`document` em estado ativo). Liga uma afirmação da
resposta do LLM a documento/chunk/página/seção/trecho/localização
verificáveis. **`citation` nunca representa conteúdo vindo de uma
`document_memory`** — ver `memory attribution`, logo abaixo, que é um
conceito **separado**, não uma variante ou um marcador dentro de
`citation`. Atributos-chave conceituais: referência à `message` (ou
`analysis_finding`), referência ao `document`/`document_chunk` de origem,
trecho ou localização (com a proveniência de página obrigatória herdada
de `document_chunk` — ver requisito invariante acima).

### `memory attribution` (atribuição de memória) — conceitual, Fase 01 em
estrutura (só passa a ser exercitada de fato a partir da Fase 02, quando
`document_memory` existir)
Quando uma resposta se baseia em `document_memory` (documento original
excluído), a referência apresentada ao usuário **nunca** é uma `citation`
— é um conceito distinto, aqui chamado de atribuição de memória. Deve
comunicar explicitamente algo equivalente a "Resumo preservado — documento
original excluído." **Nunca contém**: página verificável, trecho
verificável, referência a `document_chunk` original, ou qualquer indicação
de que a fonte primária ainda existe.
**Não decidido nesta fase**: a representação física de `memory
attribution` (entidade própria, campo discriminador de tipo numa estrutura
comum a `citation`, ou outro mecanismo). O que **é** decidido nesta fase é
que ela é conceitualmente distinta de `citation`, nunca uma variante ou
subtipo dela — impedindo, desde o modelo conceitual, o caminho
`document_memory → citation normal`. Ver `03-seguranca-privacidade-
isolamento.md`, seção 3, e ADR `0003-memoria-do-documento-sem-fonte-
primaria.md`.

### `conversation` / `message` — Fase 01
Uma conversa é um contêiner de mensagens sobre um `document` (ou, na Fase
03, sobre a biblioteca). Atributos-chave conceituais: dono, documento(s)
em escopo, timestamps. `message` carrega papel (usuário/assistente),
conteúdo, e citações associadas.
**Decisão em aberto**: se o conteúdo integral das mensagens é retido, por
quanto tempo, e com qual granularidade de auditoria — ver
`decisoes-em-aberto.md`. Não decidido nesta fase.

### `analysis` / `analysis_finding` — Fase futura identificada (Fase 05,
Raio-X / análise documental)
Um `analysis` é a execução de uma análise orientada a tipo de documento
sobre um `document`; `analysis_finding` são os pontos identificados
(multas, prazos, ambiguidades, etc.), sempre com evidência associada
(reaproveita `citation`) e nunca como veredito absoluto — só como ponto de
atenção com base no texto.

### `revision_suggestion` — Fase futura identificada (Fase 06, Sugestões de
adequação)
Sempre em trinca: original + sugestão + justificativa, mais o campo de
decisão humana (aceita/rejeitada/pendente). Nunca sobrescreve o documento
original — a entidade em si é a garantia estrutural dessa regra de
produto.

### `AI operation` — Fase 01 (telemetria mínima) e completa a partir daí
Registro por operação de IA executada — ver `04-creditos-economia-ia.md`
para o formato conceitual completo (fornecedor, modelo, tokens, custo,
créditos cobrados). Este é o análogo, no domínio de IA, do que
`analytics_events` já é para o domínio de produto hoje — mesmo princípio
de vocabulário fechado, nunca dado sensível bruto.

### `credit_ledger` — Fase futura identificada (a partir do momento em que
créditos passarem a ser cobrados de verdade — provavelmente não antes da
Fase 01 tardia ou Fase 02)
Livro-razão de créditos consumidos/concedidos por usuário/organização,
ligado a `AI operation`. Formato conceitual em `04-creditos-economia-ia.md`.
Nenhuma tabela, nenhum valor numérico de conversão é decidido nesta fase.

### `plans` / `subscriptions` — Conceitual/possível
Existe na visão comercial (FREE/IA/PRO/BUSINESS/ENTERPRISE) mas depende de
decisão de pagamento ainda não tomada — ver `decisoes-em-aberto.md`. Não
modelar estrutura de tabela até que exista um provedor de pagamento
decidido.

### `audit_events` — Fase 07 (Business), mas o *tipo* de evento a auditar já
pode ser esboçado desde já (upload, acesso, exclusão, compartilhamento,
alteração de permissão, operação administrativa, execução de operação de
IA relevante) — sem decidir ainda se o conteúdo das operações entra no
log ou só metadados, o que depende da decisão de privacidade ainda aberta
sobre conteúdo de conversas.

### `users` / `organizations` / `organization_members` / `workspaces` /
`departments` — Conceitual/possível, materializado a partir da Fase 01
(`users`, mínimo necessário para uma conta) e Fase 07 (organizações/
departamentos)
Nenhum mecanismo de autenticação foi escolhido (ver
`decisoes-em-aberto.md`), então mesmo `users` não tem forma concreta ainda
— só o reconhecimento de que a Fase 01 precisará de algum conceito mínimo
de identidade de usuário para que `document`/`conversation` tenham dono.

## 3. Tabela-resumo

| Entidade | Classificação |
|---|---|
| `document` | Fase 01 |
| `document_processing_job` | Fase 01 |
| `document_chunk` (com proveniência de página obrigatória) | Fase 01 |
| `citation`/`reference` (fonte primária) | Fase 01 |
| `memory attribution` (conceitual — não é `citation`) | Fase 01 (só passa a ser exercitada de fato a partir da Fase 02, quando `document_memory` existir) |
| `conversation` / `message` | Fase 01 |
| `users` (forma mínima) | Fase 01 |
| `document_permissions` (princípio de checagem) | Requisito desde Fase 01; tabela granular na Fase 07 |
| `document_pages` (estrutura opcional/futura — não substitui a proveniência já exigida em `document_chunk`) | Fase 01 tardia / Fase 02 |
| `document_topics` | Fase 02 |
| `document_memory` | Fase 02 (desenhada como requisito desde a Fase 00) |
| `document_version` | Fase 04 |
| `document_relations` | Fase 04 |
| `analysis` / `analysis_finding` | Fase 05 |
| `revision_suggestion` | Fase 06 |
| `organizations` / `organization_members` / `workspaces` | Fase 07 |
| `audit_events` | Fase 07 |
| `AI operation` (telemetria) | Fase 01 (mínima), completa a partir daí |
| `credit_ledger` | Fase futura (quando cobrança real começar) |
| `plans` / `subscriptions` | Conceitual/possível, aguarda decisão de pagamento |

## 4. Exclusão lógica vs. garantia física — distinção obrigatória

Marcar uma linha como "excluída" (exclusão lógica — ex.: `deleted_at`
preenchido) **não é o mesmo** que garantir que os artefatos físicos
correspondentes deixaram de existir. Esta distinção é crítica para a regra
de Memória do Documento:

- Quando o usuário escolhe **exclusão completa**: o requisito é remoção
  real do PDF original, texto integral, `document_chunk`s, embeddings dos
  chunks, OCR, e todas as `citation`s baseadas neles — não apenas marcar
  como excluído. A arquitetura real (Fase 01/02) precisa garantir isso
  dentro das capacidades da infraestrutura escolhida (ex.: se o
  armazenamento de objetos usado suporta apenas exclusão lógica com
  purga posterior por job, isso precisa ser documentado e comunicado ao
  usuário como parte da política de retenção — não presumido como
  instantâneo).
- Quando o usuário escolhe **excluir e guardar resumo**: os mesmos
  artefatos acima (PDF, texto integral, chunks, embeddings dos chunks,
  OCR) precisam ser removidos com a mesma garantia de exclusão completa —
  a única diferença é que `document_memory` foi criada *antes* dessa
  remoção e sobrevive.
- Nenhuma entidade decidida nesta fase assume qual mecanismo de storage
  garante isso — é uma decisão em aberto (ver `decisoes-em-aberto.md`,
  item de armazenamento de objetos), mas o *requisito* de garantia física,
  não só lógica, é arquitetural e vale desde a Fase 01.

## 5. O que este documento deliberadamente não faz

Não define tipos de coluna, não define índices, não define se o backend é
D1 (relacional) ou outra solução, não define se `document_chunk`/embeddings
vivem no mesmo banco dos metadados ou em um banco vetorial separado. Essas
são decisões de implementação da fase em que cada entidade for
efetivamente construída, informadas por este modelo conceitual, não
antecipadas aqui.
