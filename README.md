# ElevePDF

**Seu PDF no tamanho certo.**

Compacte e divida arquivos PDF inteiramente no seu navegador — nada é enviado a servidores. ElevePDF é um MVP (v0.1) que faz duas coisas, de verdade:

1. **Compactar PDF**, em três níveis (Leve, Equilibrada, Máxima).
2. **Dividir PDF por tamanho máximo**, respeitando um limite em bytes escolhido por você, sem nunca cortar uma página ao meio.

---

## Instalação

Pré-requisitos: Node.js 20+ (testado com Node 24) e npm.

```bash
npm install
```

## Comandos de desenvolvimento

```bash
npm run dev        # servidor de desenvolvimento (Vite)
npm run build      # build de produção (tsc -b && vite build)
npm run preview    # serve o build de produção localmente
```

## Comandos de teste

```bash
npm run gen:fixtures  # gera PDFs reais de teste em tests/fixtures/ (necessário antes dos testes)
npm test               # testes unitários (Vitest)
npm run test:e2e       # testes end-to-end (Playwright, navegador real)
npm run typecheck      # TypeScript --noEmit
npm run lint            # ESLint
```

`tests/fixtures/` não é versionado (está no `.gitignore`) — os PDFs de teste são gerados pelo próprio projeto (`npm run gen:fixtures`), nunca são documentos reais/pessoais.

---

## Arquitetura

- **React 18 + TypeScript + Vite** — SPA simples, sem framework de servidor.
- **Todo o processamento acontece no navegador do usuário**, dentro de um **Web Worker dedicado** (`src/workers/pdf.worker.ts`), para não travar a interface durante operações pesadas.
- **`pdf-lib`** — manipulação estrutural do PDF: carregar, copiar páginas, reserializar com object streams, editar objetos de imagem em baixo nível.
- **`pdfjs-dist`** — usado como parser de referência para **validação e classificação de erros** (PDF inválido / corrompido / protegido por senha / número de páginas), por ser mais rigoroso que apenas tentar reabrir com `pdf-lib`. Ele também roda dentro do worker principal, com seu próprio worker interno (workers aninhados) resolvido via `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`, o padrão recomendado do Vite para assets de worker.
- **`JSZip`** — geração do arquivo ZIP com todas as partes da divisão.
- **`src/lib/structuralAnalysis.ts`** — inspeciona (via `pdf-lib`) estruturas de nível de documento (AcroForm, outlines, destinos nomeados, campos de assinatura) logo após o upload, para alimentar os avisos da interface antes de processar. Mantido separado de `src/lib/structuralFindings.ts` (tipos e lógica pura, sem `pdf-lib`) para que o thread principal não precise carregar a biblioteca pesada de PDF só para checar um booleano.
- **`OffscreenCanvas` + `createImageBitmap`** (APIs nativas do navegador) — recompressão real de imagens JPEG embutidas, dentro do worker.
- **Vitest + Testing Library** — testes unitários e de componente.
- **Playwright** — testes end-to-end em Chromium real (desktop e mobile), incluindo upload de arquivo real e download.

### Fluxo de dados

```
UploadZone (main thread)
  → File.arrayBuffer()
  → pdfWorkerClient.ts (postMessage com Transferable ArrayBuffer)
  → pdf.worker.ts (Web Worker)
      → validation.ts (pdfjs-dist)
      → pdfCompress.ts ou pdfSplit.ts (pdf-lib)
  ← postMessage (resultado, também via Transferable ArrayBuffer)
App.tsx atualiza estado → download via Blob URL (revogada após uso)
```

Nenhum arquivo do usuário é persistido em disco, IndexedDB, `localStorage` ou enviado por rede — os bytes existem apenas em memória, durante a operação, e são liberados (URLs de objeto revogadas) ao final.

---

## Estratégia real de divisão (split)

Algoritmo guloso e **medido**, não estimado por proporção (`src/lib/pdfSplit.ts`):

1. Percorre as páginas em ordem, sem nunca reordenar.
2. Para a parte em construção, tenta incluir a próxima página e **serializa de fato** o PDF resultante (`PDFDocument.save()`) para medir o tamanho real em bytes — porque fontes, recursos compartilhados e overhead de estrutura afetam o tamanho final e uma soma proporcional dos tamanhos das páginas não seria confiável.
3. Se o resultado ultrapassar o limite, a última página fica para a próxima parte, e a parte atual é fechada (o menor número razoável de partes, sem gerar partes desnecessariamente pequenas).
4. Se uma única página sozinha já ultrapassa o limite, ela vira sua própria parte, marcada como `exceedsLimit`, **nunca é cortada** e **nunca é entregue silenciosamente como se respeitasse o limite**. A interface avisa o usuário e oferece aumentar o limite ou compactar aquela página específica (com possível perda visual).
5. Nomeação sequencial: `nome-original-parte-01.pdf`, `nome-original-parte-02.pdf`, etc., com padding conforme o total de partes.

**Limitação conhecida de performance:** o algoritmo serializa o PDF a cada página candidata (para medir o tamanho real), o que é O(n) serializações por parte. Para documentos muito grandes (milhares de páginas), isso pode ficar lento. O limite de segurança do MVP é 3000 páginas (`src/lib/limits.ts`).

## Estratégia real de compactação

Três níveis, com comportamento honesto e documentado (`src/lib/pdfCompress.ts`):

- **Leve — sem perda.** Apenas reserialização estrutural (`useObjectStreams: true`), sem tocar em imagens. Reduz overhead de estrutura do PDF. Se o PDF já estiver otimizado, a redução pode ser próxima de zero.
- **Equilibrada / Máxima — recompressão real de imagem, com portão de elegibilidade.** O código percorre os objetos indiretos do PDF e, para cada XObject de imagem, só recomprime aqueles **comprovadamente seguros** para o caminho implementado (decodificar via `createImageBitmap` → redesenhar em `OffscreenCanvas` → recodificar como JPEG RGB de 8 bits): filtro único `DCTDecode` (JPEG), `ColorSpace` `DeviceRGB`, `BitsPerComponent` 8, sem `SMask`, sem `Mask`, sem `Decode`/`DecodeParms` customizados. Qualquer imagem que não atenda a **todos** esses critérios é preservada como está — porque recodificar via canvas sempre produz JPEG RGB de 3 componentes, o que corromperia silenciosamente uma imagem grayscale, CMYK, com transparência ou com parâmetros de decodificação especiais. O novo stream (quando recomprimido) tem um dicionário **construído do zero** (não reaproveitado do original) com exatamente os campos válidos para o novo JPEG, e substitui o objeto original pela mesma referência indireta, então todas as páginas que compartilham a imagem são atualizadas automaticamente.
- **Esta versão nunca rasteriza páginas inteiras em imagem.** Não há nenhum caminho de código que transforme uma página vetorial/texto em imagem.
- **Nunca se entrega um resultado igual ou maior como se fosse uma redução.** Ao final, o tamanho do arquivo processado é comparado byte a byte com o original; se não ficou menor, o arquivo **original é devolvido intacto** (`outcome: "no-gain-original-preserved"`), e a interface informa isso claramente em vez de mostrar "0 B de redução" e ainda assim oferecer uma versão processada.

**Motivos de skip reportados** (nunca um genérico só): `unsupported-filter` (não é DCTDecode puro), `unsupported-color-space` (ColorSpace ausente ou diferente de DeviceRGB), `soft-mask-present` (tem SMask), `mask-present` (tem Mask), `unsupported-bits-per-component` (diferente de 8 bits), `unsupported-decode-params` (tem Decode/DecodeParms customizado), `decode-failed` (dimensões inválidas ou falha ao decodificar), `encode-unsupported` (navegador sem OffscreenCanvas/createImageBitmap), `no-gain` (recomprimiu, mas não ficou menor). Reportado ao usuário via `imagesFound` vs. `imagesRecompressed` e a lista de `skips`.

### O que a COMPACTAÇÃO garante

A compactação carrega o **mesmo grafo de objetos** do documento (`PDFDocument.load` → edita só os streams de imagem elegíveis, no lugar, mesma referência → `save`) e nunca recria o catálogo do zero. Por isso, ela **não altera intencionalmente** nenhuma estrutura de nível de documento — nada no código de compactação toca em AcroForm, outlines, destinos nomeados, links, metadados, camadas ou anexos.

Isso não é a mesma coisa que "testado e garantido" para todas essas estruturas. O que está **efetivamente coberto por teste automatizado** é: número e ordem das páginas preservados, texto permanecendo pesquisável (recurso de fonte presente, marcador de texto legível no stream de conteúdo) e nenhuma página rasterizada — verificado em `src/lib/__tests__/pdfCompress.test.ts` e nos testes E2E de compactação (`tests/e2e/elevepdf.spec.ts`).

AcroForm/campos de formulário, outlines/marcadores, destinos nomeados, links, metadados do catálogo, camadas e anexos são **esperados a permanecer intactos** pela arquitetura descrita acima (o código simplesmente não os toca), **mas isso não é verificado por nenhum teste automatizado nesta versão** — portanto é uma expectativa, não uma garantia testada. Isso é diferente da divisão — ver seção abaixo, onde o comportamento *é* comprovado por teste, inclusive para provar o que **não** é preservado — porque a compactação não copia páginas para um documento novo.

**O que pode ser perdido na compactação:** qualidade visual das imagens JPEG recomprimidas (níveis Equilibrada/Máxima) e resolução das imagens (nível Máxima). E, como em qualquer reescrita de PDF: a **validade criptográfica** de uma assinatura digital existente (ver seção "Assinaturas digitais" abaixo) — mesmo no nível Leve.

### O que a DIVISÃO garante — e o que NÃO garante (comprovado com um teste reprodutível)

Cada parte gerada pela divisão é um **documento PDF novo**, montado com `PDFDocument.copyPages()` a partir das páginas selecionadas — não uma cópia do catálogo original. Isso tem consequências reais, verificadas com um experimento reproduzível (`src/lib/__tests__/structuralAnalysis.test.ts`, seção "Divisão + estruturas sensíveis"):

| Estrutura | Sobrevive à divisão? |
|---|---|
| Conteúdo da página (texto, imagens, vetores) | ✅ Sim — copiado integralmente |
| Anotações de Link (URI externa) na página copiada | ✅ Sim — a anotação e sua ação são copiadas com a página |
| Anotação Widget (aparência visual de um campo de formulário) | ⚠️ A anotação em si é copiada (visualmente presente), **mas** deixa de estar registrada em um AcroForm — a parte não é um formulário funcional/preenchível |
| **AcroForm** (registro do formulário no catálogo) | ❌ Não — desaparece do catálogo de cada parte |
| **Outlines / marcadores (bookmarks)** | ❌ Não — desaparece do catálogo de cada parte |
| **Destinos nomeados (Names/Dests)** | ❌ Não — desaparece do catálogo de cada parte |
| Link interno (`Dest` apontando para uma página que ficou em **outra** parte) | ⚠️ Comportamento não garantido — o objeto de destino é copiado como órfão (fora da árvore de páginas do novo documento); leitores de PDF podem ou não conseguir resolvê-lo corretamente |

**Por isso a interface avisa antes de dividir**, quando o PDF enviado tem AcroForm, outlines, destinos nomeados ou campos de formulário em página: mostra quais estruturas foram detectadas, explica que cada parte pode não preservá-las, e **exige uma confirmação explícita do usuário** (checkbox) antes de habilitar o botão "Dividir PDF" (`src/lib/structuralAnalysis.ts` + `src/App.tsx`). Se a análise estrutural não puder ser concluída por algum motivo, o resultado é tratado como potencialmente arriscado — a interface nunca afirma "sem estruturas sensíveis" quando não tem certeza.

---

## Limites configurados (`src/lib/limits.ts`)

| Limite | Valor | Motivo |
|---|---|---|
| Tamanho máximo de arquivo | 200 MB | Manter o processamento estável dentro da memória de um navegador comum, já que tudo roda no dispositivo do usuário |
| Número máximo de páginas | 3000 | O algoritmo de divisão é O(n) serializações; acima disso o tempo de processamento cresce demais |
| Tamanho mínimo de divisão | 64 KB | Abaixo disso, dividir perde sentido prático |
| Tamanho máximo de divisão | 2 GB | Limite teórico, irrelevante na prática |

---

## Comportamento com casos especiais

- **PDF protegido por senha:** detectado via `pdfjs-dist` (`PasswordException`) e classificado especificamente — mensagem clara pedindo para remover a senha antes de enviar. O MVP não tenta abrir PDFs criptografados.
- **PDF corrompido/malformado:** detectado via `pdfjs-dist` (`InvalidPDFException`) ou por conteúdo truncado. Mensagem específica, sem travar a interface.
- **Formulários, links, marcadores, destinos nomeados:** ver as seções "O que a COMPACTAÇÃO garante" e "O que a DIVISÃO garante" acima — o comportamento é **diferente** entre compactar (essas estruturas não são intencionalmente tocadas, mas isso não é coberto por teste automatizado) e dividir (estruturas de catálogo comprovadamente não sobrevivem; a interface avisa e exige confirmação).
- **Assinaturas digitais:** a **aparência** de uma assinatura (o campo, o texto/imagem que a representa) pode permanecer no arquivo processado. A **validade criptográfica**, porém, é sempre invalidada por qualquer reserialização ou divisão — inclusive no nível "Leve", que já resserializa o PDF — como acontece em qualquer ferramenta que reescreve um arquivo PDF. Isso não é uma falha do ElevePDF; é uma propriedade de como assinaturas digitais em PDF funcionam (elas assinam os bytes exatos do arquivo). Quando um campo de assinatura é detectado (`hasDigitalSignatureFields`), a interface exibe um aviso explícito com essa distinção antes do processamento.
- **Navegadores testados:** Chromium (via Playwright, desktop e emulação mobile) e verificação manual em Chromium. A recompressão de imagem depende de `OffscreenCanvas` e `createImageBitmap` — disponíveis nos navegadores modernos (Chrome/Edge/Firefox/Safari recentes). Onde essas APIs não existem, o app não falha: recompressão é pulada com o motivo `encode-unsupported`, reportado honestamente ao usuário, e o restante do PDF (texto, estrutura) continua sendo processado normalmente.

---

## O que este projeto não faz (por escopo, não por limitação técnica)

Sem login, sem cobrança, sem outras ferramentas de PDF além de compactar/dividir (juntar, assinar, converter, editar), sem coleta de nome/conteúdo/tamanho associado à identidade dos arquivos do usuário. O único backend existente é o Analytics próprio descrito abaixo — não há nenhum outro serviço de servidor.

---

## Privacidade

> Seus arquivos são processados no seu dispositivo e não ficam armazenados em nossos servidores.

Essa frase é tecnicamente verdadeira nesta implementação: não existe backend de processamento de PDF, nenhum arquivo do usuário trafega pela rede, e os bytes só existem na memória do navegador durante o processamento. Detalhes completos (inclusive sobre o Analytics próprio) estão na página [`/privacidade`](src/pages/PrivacyPage.tsx).

---

## Domínio oficial e rotas públicas

Domínio de produção: **https://elevepdf.elevesites.com.br**

| Rota | Indexável | Descrição |
|---|---|---|
| `/` | Sim | Home — apresentação e acesso às ferramentas |
| `/compactar-pdf` | Sim | Ferramenta de compactação |
| `/dividir-pdf-por-tamanho` | Sim | Ferramenta de divisão por tamanho |
| `/privacidade` | Sim | Privacidade e controle de consentimento do Analytics |
| `/termos-de-uso` | Sim | Termos de uso |
| `/admin/analytics` | **Não** — `noindex, nofollow`, fora do sitemap/menu | Painel privado de métricas, protegido por Cloudflare Access no endpoint (ver "Analytics próprio" abaixo) |
| qualquer outra | **Não** — `noindex, nofollow` | 404 real (`dist/404.html`, ver "SEO estático por rota") |

---

## SEO estático por rota (sem SSR completo)

Cada rota pública recebe título, descrição, canonical absoluto, `robots`, Open Graph, Twitter Card e um JSON-LD `WebApplication` já presentes no **HTML inicial**, antes de qualquer JavaScript rodar — importante para crawlers que só leem o HTML bruto (WhatsApp, alguns indexadores). Não é SSR: o React continua rodando 100% no cliente; o que existe é um HTML por rota, gerado no build.

- Fonte única de verdade dos metadados: [`shared/seo/pages.ts`](shared/seo/pages.ts) (título/descrição/robots/canonical por rota) e [`shared/seo/structuredData.ts`](shared/seo/structuredData.ts) (JSON-LD). O mesmo dado é usado tanto pelo React em runtime (`useDocumentMeta`, cobre navegação SPA) quanto pelo script de build abaixo — nunca duplicado como texto solto em dois lugares.
- Geração: depois de `vite build`, o script [`scripts/generateSeoHtml.ts`](scripts/generateSeoHtml.ts) lê o `dist/index.html` gerado e escreve uma cópia por rota com os metadados corretos:
  - `dist/index.html` → `/`
  - `dist/compactar-pdf.html` → `/compactar-pdf`
  - `dist/dividir-pdf-por-tamanho.html` → `/dividir-pdf-por-tamanho`
  - `dist/privacidade.html` → `/privacidade`
  - `dist/termos-de-uso.html` → `/termos-de-uso`
  - `dist/admin/analytics.html` → `/admin/analytics` (metadados corretos, mas `noindex, nofollow`)
  - `dist/404.html` → nome especial reconhecido nativamente pelo Cloudflare Pages, servido com **HTTP 404 real** para qualquer rota desconhecida
  - Arquivos são `<rota>.html` (não `<rota>/index.html`) de propósito: no Cloudflare Pages isso resolve a requisição para `/compactar-pdf` por correspondência direta (200, sem redirecionamento) — importante para o canonical apontar exatamente para a URL que responde.
- Já roda como parte de `npm run build` (ver "Comandos" abaixo). Para gerar sozinho depois de um build existente: `npx tsx scripts/generateSeoHtml.ts`.
- Comprovação automatizada: `npm run verify:seo` lê os HTMLs gerados em `dist/` como texto puro (sem executar JavaScript) e falha se faltar algum metadado obrigatório ou se algum canonical/OG apontar para localhost/preview em vez do domínio oficial.

### Imagem Open Graph e favicons

- `public/og-elevepdf.png` — 1200×630, usada em `og:image`/`twitter:image` em todas as rotas públicas.
- `public/favicon.svg` — ícone principal (referenciado no `<head>`).
- `public/apple-touch-icon.png` — 180×180, para iOS/homescreen.
- Gerados de forma reprodutível (sem nova dependência de produção) com o Playwright já usado nos testes E2E: `npm run gen:social-assets` (roda [`scripts/generateSocialAssets.ts`](scripts/generateSocialAssets.ts), que renderiza HTML puro em viewports do tamanho exato e tira um screenshot PNG).
- Não foi gerado um `favicon.ico` multi-resolução — geração confiável desse formato exigiria uma dependência nova só para isso; navegadores modernos usam o `favicon.svg` normalmente.

### `robots.txt` e `sitemap.xml`

- `public/robots.txt`: permite indexação (`Allow: /`) e aponta para `https://elevepdf.elevesites.com.br/sitemap.xml`. Não usa `Disallow` como proteção de segurança — a rota `/admin/analytics` fica de fora do sitemap e da navegação, mas a proteção real dos dados é o endpoint (`/api/analytics/summary`) validando o JWT do Cloudflare Access no servidor, nunca a obscuridade da URL.
- `public/sitemap.xml`: lista só as cinco rotas públicas indexáveis. Sem `admin`, sem `404`, sem parâmetros, sem `localhost`/preview. Sem `lastmod` (o processo de build não tem como mantê-lo corretamente sem inventar uma data).

### `public/_redirects`

Sem a regra `/* /index.html 200` (que produziria soft-404 para qualquer URL desconhecida). O Cloudflare Pages resolve as rotas conhecidas pelos arquivos `<rota>.html` gerados no build, e serve `404.html` automaticamente, com status HTTP 404 real, para qualquer rota que não bate em nenhum arquivo — sem precisar de nenhuma regra explícita.

---

## Analytics próprio (Cloudflare Pages Functions + D1)

O único backend do projeto — analytics privado e pseudônimo, com consentimento explícito. Nunca ativo por padrão: sem aceite, `track()` é um no-op completo.

- **Consentimento**: banner com duas ações de peso visual idêntico (aceitar/recusar), revisável a qualquer momento em `/privacidade`. Escolha guardada em `localStorage`; sessão pseudônima (`crypto.randomUUID()`) guardada em `sessionStorage`, limpa imediatamente ao revogar.
- **Taxonomia fechada**: eventos, parâmetros e valores validados contra listas fechadas em [`shared/analytics/events.ts`](shared/analytics/events.ts) — o mesmo arquivo usado pelo cliente e pelo endpoint.
- **Endpoint público** `POST /api/analytics/event` ([`functions/api/analytics/event.ts`](functions/api/analytics/event.ts)): valida Origin/Host, `Content-Type`, tamanho do corpo, aplica rate limit por IP, e sempre atribui `occurred_at` no servidor (nunca confia em data vinda do cliente).
- **Painel privado** `GET /api/analytics/summary` ([`functions/api/analytics/summary.ts`](functions/api/analytics/summary.ts)): só dados agregados; toda resposta (sucesso ou erro) inclui `Cache-Control: no-store`. Protegido por validação real do JWT do Cloudflare Access ([`functions/_shared/accessAuth.ts`](functions/_shared/accessAuth.ts)) — sem `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` configurados, responde sempre `503` (bloqueado por padrão).
- **Esquema D1**: [`migrations/0001_analytics_events.sql`](migrations/0001_analytics_events.sql) — colunas fechadas com `CHECK` por enum, verificado localmente via `wrangler d1 migrations apply --local` (nunca aplicado em produção nesta fase).
- **Retenção**: plano de 90 dias documentado e testado localmente (`node:sqlite`, sem tocar em nenhum banco real) em [`scripts/analyticsRetention.ts`](scripts/analyticsRetention.ts) — a execução automática em produção (Cloudflare Cron Trigger) ainda não está configurada.

## Comandos locais

```bash
npm install               # instala dependências
npm run dev                # servidor de desenvolvimento (Vite, porta 5173)
npm run build               # tsc -b && vite build && geração do HTML estático por rota
npm run preview             # serve o build de produção localmente
npm run verify:seo          # comprova os metadados do HTML estático gerado (depois de build)
npm run gen:social-assets   # regenera og-elevepdf.png e apple-touch-icon.png
npm run gen:fixtures        # gera PDFs reais de teste em tests/fixtures/ (necessário antes dos testes)
npm test                    # testes unitários (Vitest)
npm run test:e2e            # testes end-to-end (Playwright, navegador real)
npm run typecheck           # TypeScript --noEmit (app + Cloudflare Functions/shared)
npm run lint                # ESLint
npm run d1:migrate:local    # aplica a migration do Analytics no D1 local (Miniflare, sem recurso real)
```

Para simular o roteamento real do Cloudflare Pages localmente (200 nas rotas conhecidas, 404 real em rotas desconhecidas), depois de `npm run build`:

```bash
npx wrangler pages dev dist --compatibility-date=2026-01-01
```

## Checklist de publicação (pendências antes de qualquer deploy real)

Nada abaixo foi feito ainda — só código e verificação local:

1. Criar o projeto Cloudflare Pages.
2. Criar um banco D1 real.
3. Substituir o placeholder de `database_id` em [`wrangler.toml`](wrangler.toml) pelo ID real.
4. Configurar o binding `DB` no projeto Pages.
5. Aplicar a migration (`migrations/0001_analytics_events.sql`) no D1 de produção.
6. Configurar o Cloudflare Access para `/admin/analytics`.
7. Configurar a variável `CF_ACCESS_TEAM_DOMAIN`.
8. Configurar a variável `CF_ACCESS_AUD`.
9. Validar o fluxo real de JWT do Access em produção.
10. Configurar a retenção automática de 90 dias (Cloudflare Cron Trigger).
11. Configurar o domínio `elevepdf.elevesites.com.br`.
12. Validar HTTPS.
13. Verificar `robots.txt` em produção.
14. Verificar `sitemap.xml` em produção.
15. Validar a imagem OG em produção (ex.: debugador de compartilhamento do WhatsApp/redes sociais).
16. Validar o 404 real em produção (status HTTP, não só a UI).
17. Testar o fluxo de consentimento em produção.
18. Testar o endpoint de evento em produção.
19. Testar o painel protegido em produção (bloqueado até Access ser configurado, depois liberado).
20. Cadastrar o domínio no Google Search Console.

---

Construído e mantido por Diego Arcanjo Web Studio — Eleve Sites.
