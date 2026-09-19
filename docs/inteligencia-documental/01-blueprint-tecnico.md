# Blueprint Técnico — Inteligência Documental (ElevePDF)

> Fase 00 — Fundação. Arquitetura-alvo conceitual. Nada aqui está
> implementado. Ver `docs/inteligencia-documental/00-documento-mestre.md`
> para o princípio de privacidade de dois domínios que este blueprint segue.

## 1. Arquitetura atual (resumo verificado em código, Fase 3.1 / commit
`34b70aa`)

- React 18 + TypeScript + Vite 6, SPA sem framework de servidor,
  code-splitting por rota.
- Cloudflare Pages (hosting estático) + Pages Functions (2 endpoints de API,
  `functions/api/analytics/`).
- Processamento de PDF 100% client-side, dentro de um único Web Worker
  dedicado (`src/workers/pdf.worker.ts`), com protocolo de mensagens tipado
  (`src/types/worker.ts`) e cliente fino (`src/lib/pdfWorkerClient.ts`).
- Cloudflare D1 usado exclusivamente para uma tabela de eventos de Analytics
  pseudônimos (`analytics_events`) — nenhuma outra tabela, nenhum
  armazenamento de arquivo, nenhum R2/KV/Vectorize.
- Vocabulário fechado de Analytics compartilhado entre cliente e backend
  (`shared/analytics/events.ts`), validado nos dois lados.

Este é o único estado real hoje. Tudo a partir daqui é arquitetura-alvo,
não implementada.

## 2. Arquitetura-alvo — visão geral

A Inteligência Documental introduz um segundo domínio de processamento
(remoto) ao lado do domínio local já existente, sem substituí-lo:

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│ DOMÍNIO 1 — LOCAL (hoje)     │        │ DOMÍNIO 2 — REMOTO (futuro)       │
│ Compactar / Dividir / Juntar │        │ Conversar / Indexar / Analisar /  │
│                               │        │ Correlacionar / Biblioteca / OCR  │
│ Web Worker no navegador      │        │ remoto quando necessário          │
│ PDF nunca sai do navegador   │        │ processamento remoto explícito,   │
│                               │        │ transparente e isolado            │
└─────────────────────────────┘        └──────────────────────────────────┘
```

Os dois domínios compartilham a mesma aplicação (ElevePDF), o mesmo shell
de UI, e devem compartilhar código onde fizer sentido técnico (ex.: um
parser de PDF pode ser reaproveitado para extrair texto tanto localmente
quanto como primeira etapa de um pipeline remoto) — mas a **fronteira de
onde os bytes do PDF trafegam** precisa ser explícita no código, não
implícita.

## 3. Componentes do domínio remoto (conceituais)

- **Ingestão** — recebe o PDF (ou já recebe texto extraído localmente,
  quando possível) para o pipeline remoto. Ponto de decisão: quanto do
  parsing pode continuar acontecendo no navegador antes de qualquer upload,
  reduzindo o que efetivamente precisa sair do dispositivo.
- **Extração** — texto, estrutura (páginas, seções), e metadados do
  documento. **Invariante desde a Fase 01** (ver `02-modelo-de-dados.md`,
  bloco `document_chunk`): a proveniência de página de cada trecho
  extraído é preservada já neste passo, de forma determinística — não é
  reconstruída depois.
- **Normalização/Estruturação** — texto limpo, mapeado a página/posição,
  pronto para chunking. A proveniência de página capturada na extração
  acompanha o texto por toda esta etapa, nunca é descartada e recalculada
  depois.
- **Chunking** — divisão em unidades recuperáveis (tamanho e estratégia a
  decidir na Fase 01, não nesta fase). Qualquer que seja a estratégia
  escolhida, cada `document_chunk` resultante carrega ou referencia a
  proveniência de página herdada da extração — este requisito é
  independente da estratégia de corte e independente de existir uma
  entidade `document_pages` própria (ver modelo de dados).
- **Embeddings** — vetores por chunk, gerados por um provedor a decidir.
- **Índice vetorial** — armazenamento e busca por similaridade (solução a
  decidir; ver `decisoes-em-aberto.md`).
- **Retrieval** — busca de chunks relevantes para uma pergunta,
  **sempre precedida por verificação de autorização** (ver
  `03-seguranca-privacidade-isolamento.md`, seção "Segurança do RAG" —
  este não é um passo opcional ou posterior).
- **Roteador de IA** — decide qual modelo/categoria atende cada tarefa (ver
  seção 5 abaixo).
- **LLM** — geração da resposta fundamentada, com referências.
- **Composição de resposta + referências** — liga a resposta de volta a
  documento/página/seção/evidência.

## 4. Fluxo de dados de ponta a ponta (RAG)

```
PDF
  → extração
  → normalização
  → estruturação
  → chunking
  → embeddings
  → índice vetorial
  → retrieval (com escopo de autorização já aplicado)
  → composição do contexto
  → LLM
  → resposta
  → referências (documento, página, seção, evidência)
```

Este fluxo é o alvo de longo prazo. A Fase 01 provavelmente implementa uma
fatia vertical mínima dele (documento único, sessão rápida, sem biblioteca
persistente) — o desenho exato da Fase 01 fica para o momento da sua
própria auditoria/autorização, não para esta fase.

## 5. Roteamento de IA — desacoplado de fornecedor

Categorias de tarefa previstas (a arquitetura deve conseguir rotear cada
uma para um modelo diferente, sem acoplar o código de produto a um
fornecedor específico):

- Classificação (tipo de documento, triagem)
- Embeddings
- Pergunta simples
- Resumo
- Correlação
- Comparação
- Análise profunda
- Adequação/revisão
- OCR

O usuário compra **Eleve IA**, não um fornecedor específico — ver ADR
`0001-rag-desacoplado-de-fornecedor.md`. Nenhum SDK de fornecedor é
integrado nesta fase; a abstração de roteamento em si (interface,
contratos) também não é implementada agora — só reconhecida como requisito
para quando a Fase 01 começar a integrar o primeiro provedor.

## 6. Jobs / processamento assíncrono

Operações sobre documentos grandes (extração, chunking, embeddings, OCR)
não são instantâneas e não devem bloquear a UI nem uma requisição HTTP
síncrona. O modelo de dados (`02-modelo-de-dados.md`) reserva o conceito de
`document_processing_job` como unidade de trabalho assíncrona rastreável
(estado, progresso, erro), mas a fila/orquestração real (Cloudflare Queues,
Durable Objects, ou outra solução) não é escolhida nesta fase.

## 7. Observabilidade e telemetria de IA

Toda operação de IA deve ser registrada de forma auditável e comparável a
custo real — ver `04-creditos-economia-ia.md` para o formato conceitual do
registro por operação (usuário, organização, documento, tipo de operação,
fornecedor, modelo, tokens de entrada/saída, embeddings, OCR,
armazenamento, custo real, créditos cobrados, timestamp). O padrão de
"vocabulário fechado, nunca dado bruto sensível" já usado pelo Analytics
atual (`shared/analytics/events.ts`) é o modelo a seguir — não reinventar
um segundo padrão de telemetria.

## 8. Isolamento — domínio local vs. domínio remoto, no código

Requisitos arquiteturais (não implementação):

- O código do domínio local (Web Worker de PDF, `src/lib/pdf*.ts`,
  `src/workers/pdf.worker.ts`) não deve precisar saber que o domínio remoto
  existe. Nenhuma dependência circular.
- Qualquer novo endpoint remoto que receba conteúdo de PDF deve viver em um
  namespace de rota claramente distinto (ex.: `functions/api/ai/*` versus
  `functions/api/analytics/*` existente), para que auditoria de tráfego de
  rede consiga distinguir os dois domínios sem ambiguidade.
- A UI deve poder indicar visualmente, por tela, qual domínio está ativo —
  requisito de produto (seção 2 do documento mestre), com implicação direta
  no componente de layout (`ToolPageLayout`/equivalente futuro).

## 9. Integração com a arquitetura existente

- O padrão de **code-splitting por rota** (`src/App.tsx`, `lazy()`) já
  existente deve se estender naturalmente às novas rotas de IA — nenhuma
  mudança estrutural necessária, só mais entradas lazy.
- O padrão de **vocabulário fechado compartilhado** (`shared/`) usado por
  Analytics e SEO é o modelo a repetir para qualquer novo domínio de dados
  (ex.: um futuro `shared/ai/` para tipos de operação de IA).
- O D1 existente (`elevepdf-analytics`) é dedicado a Analytics; qualquer
  necessidade futura de banco relacional para documentos/usuários/créditos
  é uma decisão em aberto sobre se reutiliza o mesmo D1 (schema separado)
  ou usa um banco dedicado — ver `decisoes-em-aberto.md`.
- O padrão de **migração incremental por reconstrução de tabela** (usado em
  `migrations/0002_add_juntar_pdfs.sql`, necessário porque SQLite/D1 não
  suporta `ALTER` de `CHECK`) é uma restrição técnica relevante a
  considerar ao desenhar qualquer schema futuro com vocabulário fechado —
  mas nenhuma migration é criada nesta fase.
