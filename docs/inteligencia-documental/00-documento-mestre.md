# Documento Mestre — Inteligência Documental (ElevePDF)

> Fase 00 — Fundação. Este documento é conceitual/arquitetural. Não descreve
> nenhuma funcionalidade implementada. Para o estado real do código hoje,
> ver `README.md` na raiz do repositório — este documento nunca deve ser
> tratado como descrição do produto atual.

## 1. Visão

O ElevePDF continua sendo um único produto. A Inteligência Documental é uma
**nova área dentro do ElevePDF**, não um produto separado, não outro
repositório, não outra aplicação. As ferramentas atuais (Compactar, Dividir,
Juntar) continuam sendo a porta de entrada de aquisição por SEO e continuam
funcionando exatamente como funcionam hoje.

A Inteligência Documental amplia o que o usuário pode fazer com um PDF depois
de tê-lo em mãos: não só transformar o arquivo, mas conversar com ele,
entendê-lo, compará-lo com outros, e mantê-lo organizado numa biblioteca
pessoal ou corporativa.

## 2. Princípio fundamental de privacidade (dois domínios)

Este é o princípio mais importante desta fundação e **substitui qualquer
leitura anterior de que "o PDF nunca sai do navegador" seja uma garantia
universal do produto inteiro**. Essa garantia continua valendo para um
domínio específico, não para o produto todo:

### Domínio 1 — Ferramentas PDF clássicas
Compactar, Dividir, Juntar, e qualquer ferramenta futura que continue
tecnicamente compatível com processamento local. Princípio **inalterado**:
o conteúdo do PDF não sai do navegador do usuário. Esta garantia não pode
ser degradada silenciosamente por nenhuma mudança futura — qualquer proposta
que exigisse enviar esses PDFs a um servidor exigiria decisão explícita do
PO, nunca uma consequência colateral de uma refatoração.

### Domínio 2 — Inteligência Documental
Conversar, indexar, correlacionar, analisar, biblioteca, OCR remoto e demais
operações de IA **poderão** exigir processamento remoto — é tecnicamente
inevitável para a maior parte dessas funcionalidades (um LLM não roda no
navegador do usuário; um índice vetorial persistente não vive em
`localStorage`). O princípio para este domínio é:

> **Processamento local por padrão quando tecnicamente compatível;
> processamento remoto somente quando necessário para a funcionalidade
> solicitada — de forma explícita, transparente e isolada.**

Consequências obrigatórias deste princípio (válidas desde já como requisito
de UX futuro, não apenas de arquitetura):

- Antes de qualquer upload remoto, a interface deve deixar claro ao usuário
  que aquela operação específica envolve processamento remoto — nunca
  silencioso, nunca implícito por estar "na mesma tela" de uma ferramenta
  clássica.
- Persistir um documento numa biblioteca exige **ação explícita** do
  usuário — nunca é o comportamento padrão de abrir/usar um PDF.
- Os dois domínios devem ser **visualmente e arquiteturalmente distinguíveis**
  para o usuário — ele precisa conseguir saber, a qualquer momento, se está
  numa ferramenta 100% local ou numa funcionalidade que envolve servidor.

Fornecedor, política de retenção do lado remoto e implementação concreta
**não são decididos nesta fase** — ver `decisoes-em-aberto.md`.

## 3. Os cinco pilares

```
CONVERSAR → ENCONTRAR → RELACIONAR → ANALISAR → APRIMORAR
```

- **Conversar**: perguntar sobre um PDF e sobre a biblioteca inteira,
  com respostas fundamentadas e referenciáveis (documento, página, seção,
  evidência).
- **Encontrar**: busca semântica (por significado, não só por nome de
  arquivo) e organização da biblioteca (pastas, tags, favoritos, assuntos
  automáticos, Memórias de Documento).
- **Relacionar**: correlação entre documentos por assunto, entidades,
  conceitos, versões, contexto e similaridade semântica.
- **Analisar**: comparação entre documentos, Raio-X documental adaptado ao
  tipo de documento (contrato, edital, proposta, relatório, material
  educacional, financeiro, outros), análise contratual orientada a papel
  (contratante/contratada/neutra) e revisão de documentos próprios.
- **Aprimorar**: sugestões de adequação e relatórios de revisão — sempre
  preservando original + sugestão + justificativa + decisão humana,
  **nunca substituindo silenciosamente** o documento original.

## 4. Funcionalidades previstas (visão de produto, não escopo de fase)

| Código | Funcionalidade | Resumo |
|---|---|---|
| A | Conversar com PDF | Perguntas fundamentadas no documento, com referência a página/seção quando identificável |
| B | Biblioteca Inteligente | Documentos, pastas, tags, favoritos, assuntos automáticos, Memórias de Documento |
| C | Busca semântica | Localizar por significado do conteúdo |
| D | Conversar com a biblioteca | Perguntas que atravessam múltiplos documentos autorizados |
| E | Correlação | PDFs relacionados por assunto/entidade/conceito/versão/similaridade |
| F | Comparação | Comuns, diferenças, alterações, exclusividades, contradições, evolução |
| G | Raio-X documental | Análise adaptada ao tipo de documento |
| H | Contratos | Multas, rescisão, renovação, reajustes, prazos, garantias, exclusividade, responsabilidades, confidencialidade, PI, proteção de dados — como pontos de atenção com evidência, nunca como veredito legal |
| I | Sugestões de adequação | Original + sugestão + justificativa + decisão humana, nunca substituição silenciosa |
| J | Revisão de documentos próprios | Inconsistências, valores divergentes, datas, ambiguidades, lacunas, clareza, coerência |
| K | Relatório de revisão | Original + sugestão + justificativa + referência |
| L | OCR | Para PDFs sem camada textual — **não implementado nesta fase** |

Nenhuma destas é implementada na Fase 00. Esta tabela existe para que o
blueprint técnico (`01-blueprint-tecnico.md`) e o modelo de dados
(`02-modelo-de-dados.md`) sejam desenhados sem fechar portas para nenhuma
delas.

## 5. Fronteiras explícitas desta fase (Fase 00)

Não implementado, não integrado, não decidido nesta fase:

- Chat com PDF (nenhum código de conversa)
- Qualquer provedor de IA (LLM, embeddings, OCR)
- Qualquer recurso pago, preço ou crédito
- Qualquer serviço externo contratado ou ativado
- Deploy, migration remota, ou qualquer escrita em infraestrutura Cloudflare real
- Qualquer refatoração das ferramentas PDF existentes "para preparar a IA"

Esta fase produz **somente fundação documental** — visão, arquitetura-alvo,
modelo de dados conceitual, requisitos de segurança/privacidade, e o modelo
econômico conceitual. Nenhuma linha de código de produto foi alterada.

## 6. Roadmap (aproximado, sujeito a ajuste de dependência entre fases pelo PO)

| Fase | Conteúdo |
|---|---|
| 00 | Fundação arquitetural (esta fase) |
| 01 | Conversar com PDF |
| 02 | Biblioteca Inteligente + Memória do Documento |
| 03 | Busca e conversa entre documentos |
| 04 | Correlação + comparação |
| 05 | Raio-X / análise documental |
| 06 | Sugestões de adequação + revisão |
| 07 | Business / organizações / RBAC / auditoria |
| 08 | Base de Conhecimento Corporativa |

O executor pode sugerir ajustes de dependência entre fases (ex.: um pré-
requisito técnico descoberto durante a implementação), mas não altera o
escopo de produto unilateralmente.

## 7. Papéis do produto (conceituais, não implementados)

- **Visitante** — uso das ferramentas públicas; futuramente, experiência
  limitada de IA quando permitido.
- **Usuário autenticado** — conta individual (mecanismo de autenticação
  ainda não decidido, ver `decisoes-em-aberto.md`).
- **Usuário Free** — limites gratuitos.
- **Usuário IA** — recursos individuais pagos.
- **Usuário Pro** — recursos avançados (correlação, comparação, Raio-X,
  adequação).
- **Membro Business** — participante de organização.
- **Administrador da organização** — gerencia membros, permissões, recursos.
- **Papéis corporativos (RBAC)** — configuráveis, não fixos por nome.
- **Operação interna Eleve** — funções administrativas com privilégio
  mínimo e auditoria (o painel `/admin/analytics` já existente é o único
  precedente concreto disso no código atual).

Nenhum destes papéis é implementado nesta fase. Nenhum mecanismo de
autenticação foi escolhido.

## 8. Papéis de governança do desenvolvimento

- **PO / PM / Arquiteto / Auditor — ChatGPT.** Visão de produto,
  priorização, requisitos, decisões de arquitetura aprovadas, critérios de
  aceite, auditoria adversarial, autorização de fases.
- **Executor técnico — Claude.** Inspeção do estado real, implementação
  conforme escopo autorizado, testes correlatos, documentação técnica,
  apresentação de evidências, identificação explícita de bloqueios/riscos.
  O executor não transforma hipótese em decisão de produto.

## 9. Decisões em aberto

Ver `decisoes-em-aberto.md` para a lista completa e as alternativas/trade-
offs de cada item não decidido nesta fase.
