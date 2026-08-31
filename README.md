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

- **Leve — sem perda.** Apenas reserialização estrutural (`useObjectStreams: true`), sem tocar em imagens. Reduz overhead de estrutura do PDF. Se o PDF já estiver otimizado, a redução pode ser próxima de zero — e a interface informa isso honestamente, em vez de fingir uma compactação que não aconteceu.
- **Equilibrada / Máxima — recompressão real de imagem.** O código percorre os objetos indiretos do PDF, localiza XObjects de imagem cujo filtro é `DCTDecode` (JPEG), decodifica os bytes originais via `createImageBitmap`, redesenha em um `OffscreenCanvas` e recodifica como JPEG na qualidade do nível escolhido (0.75 na Equilibrada, 0.4 na Máxima, com redução adicional de resolução — máximo de 1200px no lado maior — na Máxima). O novo stream substitui o objeto original **pela mesma referência indireta**, então todas as páginas que compartilham aquela imagem são atualizadas automaticamente, sem precisar tocar nos dicionários de recursos de cada página.
- **Esta versão nunca rasteriza páginas inteiras em imagem.** Não há nenhum caminho de código que transforme uma página vetorial/texto em imagem. Por isso, o aviso da especificação sobre avisar antes de rasterizar não se aplica: rasterização simplesmente não é usada em nenhum nível do MVP.

**Limitação conhecida:** apenas imagens com filtro `DCTDecode` (JPEG) são recomprimidas. Imagens em outros formatos (ex.: bitmaps `FlateDecode`/indexados, PNG com transparência) não são recomprimidas nesta versão — o código detecta e conta esses casos (`skips` com motivo `unsupported-filter`) em vez de falhar silenciosamente ou fingir que processou. Isso é reportado ao usuário via `imagesFound` vs. `imagesRecompressed`.

**O que é preservado:** texto pesquisável, links, formulários, assinaturas digitais, ordem e número de páginas, dimensões e orientação — porque o conteúdo vetorial/texto nunca é tocado, apenas os XObjects de imagem JPEG.

**O que pode ser perdido:** qualidade visual das imagens JPEG recomprimidas (níveis Equilibrada/Máxima) e resolução das imagens (nível Máxima).

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
- **Formulários, links, camadas:** preservados nos níveis Leve/Equilibrada/Máxima, pois nenhum deles reescreve a estrutura de conteúdo — apenas o Leve reserializa (sem perda) e Equilibrada/Máxima trocam apenas os bytes de imagens JPEG.
- **Assinaturas digitais:** qualquer edição de bytes do PDF (inclusive a reserialização "sem perda") invalida uma assinatura digital existente, como acontece em qualquer editor de PDF. Isso não é um recurso, é uma limitação inerente a qualquer ferramenta que reescreve o arquivo — documentada aqui para transparência.
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
