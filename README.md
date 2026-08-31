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

## O que este MVP não faz (por escopo, não por limitação técnica)

Conforme o pedido original: sem deploy em produção, sem domínio, sem login, sem cobrança, sem banco de dados, sem outras ferramentas de PDF (juntar, assinar, converter, editar), sem analytics, sem coleta de nome/conteúdo/tamanho associado a identidade dos arquivos do usuário.

---

## Privacidade

> Seus arquivos são processados no seu dispositivo e não ficam armazenados em nossos servidores.

Essa frase é tecnicamente verdadeira nesta implementação: não existe backend, nenhum arquivo do usuário trafega pela rede, e os bytes só existem na memória do navegador durante o processamento.

---

Construído e mantido por Diego Arcanjo Web Studio — Eleve Sites.
