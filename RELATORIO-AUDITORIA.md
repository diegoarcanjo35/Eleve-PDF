# Relatório de Auditoria — ElevePDF v0.1 (MVP)

Data: 2026-08-30
Agente executor: Claude (Claude Code)
Destinatário: PO / auditor técnico (ChatGPT do Diego)

---

## 1. Caminho completo do projeto

```
C:\Users\Windows 11\Documents\GitHub\Eleve-PDF
```

Repositório Git já existia (criado pelo GitHub Desktop, com um commit inicial contendo apenas `.gitattributes` e um remote `origin` apontando para `https://github.com/diegoarcanjo35/Eleve-PDF.git`). Todo o código deste MVP foi adicionado dentro dele, sem tocar em nenhum outro repositório ou diretório do sistema (com uma única exceção documentada no item 24 abaixo, sobre um arquivo de configuração de sessão fora do projeto).

## 2. Estrutura criada

```
Eleve-PDF/
├── README.md
├── RELATORIO-AUDITORIA.md          (este arquivo)
├── package.json / package-lock.json
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── vite.config.ts
├── eslint.config.js
├── playwright.config.ts
├── index.html
├── .gitignore
├── public/
│   └── favicon.svg
├── scripts/
│   └── generate-fixtures.ts        (gera PDFs reais de teste)
├── src/
│   ├── main.tsx / App.tsx / index.css
│   ├── components/                 (UploadZone, FileCard, ProgressBar,
│   │                                 CompressPanel, SplitPanel,
│   │                                 CompressResultView, SplitResultView,
│   │                                 Footer + __tests__/)
│   ├── lib/                        (format, filenames, errors, limits,
│   │                                 validation, pdfSplit, pdfCompress,
│   │                                 compressionLevels, pdfWorkerClient,
│   │                                 zip, download + __tests__/)
│   ├── workers/
│   │   └── pdf.worker.ts           (Web Worker: toda a manipulação pesada)
│   ├── types/
│   │   └── worker.ts               (protocolo de mensagens do worker)
│   └── test/
│       ├── setup.ts
│       └── pdfFixtures.ts          (gera PDFs reais para os testes unitários)
└── tests/
    ├── e2e/
    │   └── elevepdf.spec.ts        (Playwright, navegador real)
    └── fixtures/                   (gerado por `npm run gen:fixtures`,
                                      NÃO versionado — ver .gitignore)
```

## 3. Arquitetura adotada

React 18 + TypeScript + Vite, SPA sem backend. Todo o processamento de PDF acontece **dentro de um Web Worker dedicado** (`src/workers/pdf.worker.ts`), para nunca travar a interface. Detalhes completos, incluindo o fluxo de dados, estão no [README.md](./README.md#arquitetura).

Decisões arquiteturais registradas durante a descoberta inicial:
- Ambiente: Node.js v24.15.0, npm 11.12.1 (verificados no início da execução).
- Diretório de destino já era um repositório Git vazio (só `.gitattributes`) com remote configurado — projeto criado do zero dentro dele.
- Escolhi montar o projeto manualmente (em vez do `npm create vite@latest`) porque o CLI interativo do Vite não funcionou de forma não-interativa neste ambiente (prompt de diretório não vazio foi cancelado automaticamente pelo shell não-interativo).
- Todas as bibliotecas de manipulação de PDF (`pdf-lib`, `pdfjs-dist`) e o `JSZip` rodam 100% no navegador — nenhuma delas depende de Node/servidor em produção.

## 4. Bibliotecas utilizadas e versões (`package.json`)

Dependências de produção:
- `react` `^18.3.1`, `react-dom` `^18.3.1`
- `pdf-lib` `^1.17.1` — manipulação estrutural do PDF (split, reserialização, edição de objetos de imagem)
- `pdfjs-dist` `^4.9.155` — validação/classificação de erros
- `jszip` `^3.10.1` — geração do ZIP

Dependências de desenvolvimento (build/lint/teste): `vite` `^6.0.7`, `typescript` `~5.6.3`, `vitest` `^4.1.11` (ver item 18 sobre a atualização de major), `@testing-library/react` `^16.1.0`, `@playwright/test` `^1.49.1`, `eslint` `^9.18.0` + `typescript-eslint` `^8.19.1`, `jpeg-js` `^0.4.4` (só para gerar JPEGs reais de teste em Node), `tsx` `^4.19.2`.

Versões exatas instaladas estão travadas em `package-lock.json`.

## 5. Funcionamento real da compactação

**Não é simulada.** Implementação em `src/lib/pdfCompress.ts`. Resumo (detalhes completos no README):

- **Leve** = reserialização estrutural sem perda (`useObjectStreams: true`), sem tocar em imagens.
- **Equilibrada/Máxima** = localiza XObjects de imagem com filtro `DCTDecode` (JPEG) nos objetos indiretos do PDF, decodifica via `createImageBitmap`, redesenha em `OffscreenCanvas`, recodifica como JPEG na qualidade do nível (0.75 / 0.4, com downscale para máx. 1200px no lado maior na Máxima), e substitui o stream original **pela mesma referência indireta** — todas as páginas que usam aquela imagem são atualizadas automaticamente.
- Nunca rasteriza páginas inteiras (nenhum caminho de código faz isso nesta versão).
- Imagens fora do filtro JPEG não são recomprimidas (limitação declarada, contabilizada via `skips`).

**Evidência real (capturada via teste end-to-end em Chromium real, arquivo `with-images.pdf` gerado pelo próprio projeto, 49.27 KB, 6 páginas, 1 imagem JPEG embutida):**

| Nível | Tamanho original | Tamanho final | Redução | Imagens recomprimidas |
|---|---|---|---|---|
| Leve | 49.27 KB | 49.27 KB | 0 B (0.0%) — reportado honestamente como "sem redução significativa" | 0/1 (não recomprime) |
| Equilibrada | 49.27 KB | 16.37 KB | 32.91 KB (**66.8%**) | 1/1 |
| Máxima | 49.27 KB | 9.85 KB | 39.42 KB (**80.0%**) | 1/1 |

## 6. Funcionamento real da divisão

**Não é simulada.** Implementação em `src/lib/pdfSplit.ts`. Algoritmo guloso, medido (serializa de fato cada candidato para obter o tamanho real em bytes, nunca estima por proporção). Detalhes completos no README, item "Estratégia real de divisão".

**Evidência real (capturada via teste end-to-end em Chromium real, arquivo `large-unique-images.pdf` gerado pelo próprio projeto — 5 páginas, cada uma com uma imagem JPEG única e grande, 489 KB total):**

Limite de 150 KB → **5 partes**, cada uma com 1 página, todas dentro do limite:
`110.93 KB, 99.50 KB, 98.11 KB, 86.70 KB, 84.93 KB`.

Limite de 64 KB (menor que qualquer página isolada) → **5 partes**, todas marcadas honestamente como `ACIMA DO LIMITE`, cada uma preservando sua única página sem cortá-la, com aviso explícito na interface e opção de compactar a página ou aumentar o limite.

Arquivo de texto puro (`multi-page-text.pdf`, 14 páginas, 6.68 KB) com limite de 1 MB → **1 parte** (o documento inteiro já cabe no limite — comportamento correto, sem gerar partes desnecessárias).

## 7. Algoritmo usado para respeitar o limite

Ver README, seção "Estratégia real de divisão". Resumo: adição gulosa página-a-página com serialização real a cada tentativa; fecha a parte assim que o próximo candidato ultrapassaria o limite; nunca reordena; nunca corta uma página.

## 8. Tratamento de página maior que o limite

A página vira sua própria parte, marcada `exceedsLimit: true`. A interface (`SplitResultView.tsx`) exibe um aviso claro, o badge "ACIMA DO LIMITE" na parte afetada, e um botão "Compactar esta parte" que roda a compactação (nível Máxima) só naquela página isolada, tentando reduzi-la abaixo do limite — com possível perda visual, como pedido na especificação. Nunca é entregue silenciosamente como se respeitasse o limite.

## 9. Estruturas preservadas

Texto pesquisável, links, formulários, ordem e número de páginas, dimensões e orientação — em todos os níveis. Isso é garantido estruturalmente: nenhum código deste MVP reescreve conteúdo vetorial/texto; apenas os níveis Equilibrada/Máxima substituem bytes de imagens JPEG.

## 10. Estruturas que podem ser perdidas

- Qualidade visual das imagens JPEG (Equilibrada/Máxima) e resolução das imagens (Máxima) — informado ao usuário antes de processar (nota na interface) e depois (contagem de imagens recomprimidas).
- Assinaturas digitais: qualquer reescrita de bytes do PDF (mesmo a reserialização "sem perda" do nível Leve) invalida uma assinatura digital existente — limitação inerente a qualquer ferramenta que resserializa PDF, documentada no README.
- Imagens em formatos diferentes de JPEG (`DCTDecode`) não são recomprimidas — não há perda nelas, mas também não há redução.

## 11. Limites configurados

| Limite | Valor |
|---|---|
| Tamanho máximo de arquivo | 200 MB |
| Número máximo de páginas | 3000 |
| Tamanho mínimo de divisão | 64 KB |
| Tamanho máximo de divisão | 2 GB |

(`src/lib/limits.ts`, com justificativa de cada valor no README.)

## 12–14. Testes criados, quantidade executada e resultado por suíte

### Testes unitários e de componente (Vitest + Testing Library)

Comando: `npm test` (após `npm run gen:fixtures`).

```
Test Files  7 passed (7)
     Tests  43 passed (43)
  Duration  8.33s
```

Arquivos de teste:
- `src/lib/__tests__/format.test.ts` — formatação de bytes/porcentagem, cálculo de redução.
- `src/lib/__tests__/filenames.test.ts` — sanitização de nomes, nomenclatura sequencial de partes.
- `src/lib/__tests__/validation.test.ts` — assinatura de arquivo, PDF válido, não-PDF, corrompido, acima do limite (com PDFs **reais** gerados pelo próprio teste, não mocks).
- `src/lib/__tests__/pdfSplit.test.ts` — página única, múltiplas partes, ordem preservada, nenhuma parte vazia, página isolada maior que o limite, PDF customizado, partes carregáveis de verdade (`PDFDocument.load`), menor número razoável de partes — 8 testes, todos com PDFs reais gerados via `pdf-lib`.
- `src/lib/__tests__/pdfCompress.test.ts` — nível Leve sem perda e sem tocar em imagens, detecção honesta de imagens JPEG, nunca rasteriza, PDF só-texto reporta zero imagens.
- `src/components/__tests__/UploadZone.test.tsx` — renderização, navegação por teclado (Enter abre o seletor), estado desabilitado.
- `src/components/__tests__/FileCard.test.tsx` — exibição de nome/tamanho/páginas, mensagens de erro acessíveis via `role="alert"`, botão remover.

**Limitação declarada:** em Node/jsdom (ambiente do Vitest) não existem `OffscreenCanvas`/`createImageBitmap`, então a recompressão real de imagem JPEG não pode ser exercitada nesse ambiente — o teste correspondente valida que o código reconhece essa limitação (`skip` com motivo `encode-unsupported`) em vez de fingir sucesso. A recompressão real de imagem é validada nos testes end-to-end (abaixo), em um Chromium de verdade.

### Testes end-to-end (Playwright, Chromium real — desktop e mobile)

Comando: `npm run test:e2e` (builda a aplicação e sobe `vite preview` automaticamente).

```
12 passed (14.0s)
```

Cobrindo, em dois projetos (`chromium` e `mobile-chromium`/Pixel 7): marca e slogan no primeiro viewport, rejeição de arquivo que não é PDF, validação de PDF real com exibição de nome/tamanho/páginas, divisão real com download de ZIP, compactação real com exibição de tamanho original/final/redução, e viewport mobile.

### Fixtures de teste

Geradas por `npm run gen:fixtures` (`scripts/generate-fixtures.ts`), usando `pdf-lib` (estrutura do PDF) e `jpeg-js` (codificação JPEG real, sintética) — **nenhum documento pessoal ou externo**. Arquivos gerados: `simple-1-page.pdf`, `multi-page-text.pdf` (14 páginas), `with-images.pdf` (6 páginas + 1 imagem JPEG real), `large-unique-images.pdf` (5 páginas, cada uma com imagem JPEG única e grande — usado para forçar cenários de múltiplas partes e de página isolada acima do limite), `corrupted.pdf` (PDF válido truncado de propósito), `not-a-pdf.txt`.

## 15. Resultado do lint

```
> eslint .
(sem saída — 0 erros, 0 avisos)
```

## 16. Resultado do TypeScript

```
> tsc -b --noEmit
(sem saída — 0 erros)
```

`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` todos ativados.

## 17. Resultado do build

```
> tsc -b && vite build
✓ 47 modules transformed.
dist/index.html                          0.72 kB │ gzip:  0.42 kB
dist/assets/pdf.worker-*.js            802.13 kB
dist/assets/pdf.worker.min-*.mjs     1,375.84 kB
dist/assets/index-*.css                  9.08 kB │ gzip:  2.51 kB
dist/assets/index-*.js                 261.40 kB │ gzip: 83.43 kB
✓ built em ~6s
```

O bundle principal do thread de UI (`index-*.js`) ficou em 261 KB (83 KB gzip) — leve, pois `pdf-lib`/`pdfjs-dist` foram isolados no bundle do Web Worker (`pdf.worker-*.js`) e só são baixados quando o usuário efetivamente processa um arquivo. `pdf.worker.min-*.mjs` é o worker interno do próprio `pdfjs-dist` (biblioteca de terceiros, carregado sob demanda pelo worker principal).

## 18. Vulnerabilidades encontradas

`npm audit` inicial (349 pacotes) encontrou **5 vulnerabilidades** (3 moderadas, 1 alta, 1 crítica) — todas na cadeia de dependências de desenvolvimento `esbuild → vite → vite-node → vitest` (um problema conhecido do servidor de dev do esbuild, [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)), **nenhuma em dependência de produção**. Corrigido atualizando `vitest` de `^2.1.8` para `^4.1.11` (`npm audit fix --force`, uma mudança de major version, mas restrita à ferramenta de teste — não afeta o código de produção nem o bundle publicado). Após a correção:

```
found 0 vulnerabilities
```

Confirmado novamente após a remoção posterior do `vite-plugin-static-copy` (ver item 20).

## 19. Limitações conhecidas

- **Performance de divisão em documentos muito grandes**: o algoritmo serializa o PDF a cada página candidata; para milhares de páginas isso pode ficar lento (mitigado pelo limite de 3000 páginas).
- **Recompressão de imagem limitada a JPEG (`DCTDecode`)**: outros formatos de imagem embutida não são recomprimidos nesta versão; o app reporta isso honestamente (`imagesFound` vs. `imagesRecompressed`, motivo de skip).
- **Fixture de PDF criptografado real não foi gerada**: `pdf-lib` não oferece suporte para criar PDFs com senha, e não havia tempo/escopo para implementar um handler de criptografia PDF do zero apenas para gerar um fixture de teste. A classificação de erro "protegido por senha" depende do `PasswordException` do `pdfjs-dist`, que é testada em unidade através da lógica de mapeamento de erro (não com um PDF criptografado real gerado no projeto) — é a única exceção à regra de "sempre usar PDFs reais gerados pelo projeto" nesta suíte, e está registrada aqui por transparência.
- **Assinaturas digitais são invalidadas por qualquer reescrita do PDF** (limitação inerente à reserialização, não específica do ElevePDF).
- **Navegadores testados**: Chromium (desktop + emulação mobile Pixel 7) via Playwright, e verificação manual em Chromium. Não foi testado em Firefox/Safari real neste ciclo — ambos suportam as APIs usadas (`OffscreenCanvas`, `createImageBitmap`, Web Workers com ES modules), mas não foram exercitados automaticamente.
- **Sem testes de cancelamento real de compactação**: o botão "Cancelar" na divisão funciona de verdade (o worker verifica uma flag de cancelamento entre páginas); a compactação não expõe cancelamento na interface porque o laço de recompressão de imagem não verificava esse sinal — decidi não adicionar um botão que fingisse cancelar, e documentar isso como funcionalidade não implementada nesta versão, em vez de simular.

## 20. Arquivos criados e alterados

Todos os arquivos listados na árvore do item 2 foram **criados** nesta sessão. Nenhum arquivo pré-existente do repositório (`.gitattributes`) foi alterado. Durante o desenvolvimento, dois ajustes de dependência valem registro:
- `vite-plugin-static-copy` foi adicionado e depois **removido** (não era necessário — o padrão `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` do próprio Vite resolve o asset do worker do `pdfjs-dist` tanto em dev quanto em build, de forma mais simples).
- `vitest` foi atualizado de `^2.1.8` para `^4.1.11` para eliminar a vulnerabilidade crítica descrita no item 18.

Fora do diretório do projeto, o único arquivo tocado foi `C:\Users\Windows 11\Desktop\Sites\.claude\launch.json` — um arquivo de configuração da sessão do Claude Code (não um projeto do usuário), onde foi **adicionada** uma nova entrada `elevepdf-dev` para permitir pré-visualizar o app, preservando todas as entradas existentes de outros projetos.

## 21. Saída de `git status --short`

```
?? .gitignore
?? README.md
?? RELATORIO-AUDITORIA.md
?? eslint.config.js
?? index.html
?? package-lock.json
?? package.json
?? playwright.config.ts
?? public/
?? scripts/
?? src/
?? tests/
?? tsconfig.app.json
?? tsconfig.json
?? tsconfig.node.json
?? vite.config.ts
```

(Todos os arquivos como não rastreados — `??` — nada foi adicionado à staging area.)

## 22. Confirmação de que não houve commit

**Confirmado.** Nenhum `git add` nem `git commit` foi executado. O único commit do repositório é o `dd2de94 "Initial commit"` pré-existente (criado pelo GitHub Desktop, contendo apenas `.gitattributes`), anterior a esta sessão.

## 23. Confirmação de que não houve push

**Confirmado.** Nenhum `git push` foi executado. O remote `origin` já existia antes desta sessão (não foi criado por mim) e não foi tocado.

## 24. Confirmação de que não houve deploy

**Confirmado.** Nenhum deploy, domínio, hospedagem ou publicação foi configurado. O único servidor executado foi o `vite dev`/`vite preview` local, na porta 4173/5173 da própria máquina, apenas para verificação manual e pelos testes automatizados — ambos os processos foram encerrados ao final da sessão.

## 25. Instruções exatas para executar localmente

```bash
cd "C:\Users\Windows 11\Documents\GitHub\Eleve-PDF"
npm install
npm run gen:fixtures   # necessário antes de rodar os testes
npm run dev            # abre em http://localhost:5173
```

Para build de produção local:

```bash
npm run build
npm run preview        # abre em http://localhost:4173
```

Para rodar toda a suíte de verificação:

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e        # baixa o Chromium do Playwright na primeira vez: npx playwright install chromium
npm run build
```

---

## Exigências não totalmente atendidas (declaradas, não improvisadas)

| Exigência | Por que não foi possível integralmente | Alternativa implementada | Impacto que permanece |
|---|---|---|---|
| Fixture de PDF protegido por senha gerado pelo próprio projeto | `pdf-lib` não suporta criar PDFs criptografados; implementar um encoder de criptografia PDF do zero estava fora do escopo de tempo do MVP | Classificação de erro "protegido por senha" testada via mapeamento de exceção (`PasswordException` do `pdfjs-dist`), não com um arquivo criptografado real | O caminho de detecção de senha em si (dado um PDF realmente criptografado) não foi exercitado ponta a ponta por um teste automatizado nesta versão |
| Cancelamento durante a compactação | O laço de recompressão de imagem não verifica uma flag de cancelamento (só o de divisão verifica) | Botão de cancelar exposto apenas na divisão, que cancela de verdade | Usuário não pode interromper uma compactação em andamento nesta versão |
| Testes automatizados em Firefox/Safari reais | Fora do escopo de tempo desta entrega | Testes e2e cobrem Chromium desktop + emulação mobile (Pixel 7); verificação manual em Chromium | Compatibilidade em outros motores de navegador não foi verificada automaticamente, embora as APIs usadas sejam padrão e amplamente suportadas |

---

## STATUS DA ENTREGA: PRONTA PARA AUDITORIA
