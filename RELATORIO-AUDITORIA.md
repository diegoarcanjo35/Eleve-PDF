# Relatório de Correção Cirúrgica — ElevePDF v0.1.1

Data: 2026-08-31
Agente executor: Claude (Claude Code)
Destinatário: PO / auditor técnico (ChatGPT do Diego)

Este relatório documenta exclusivamente as correções pedidas na "ORDEM DE CORREÇÃO CIRÚRGICA v0.1.1", em resposta aos 10 bloqueios levantados na auditoria da v0.1. Nenhuma funcionalidade nova foi adicionada; nenhuma arquitetura foi substituída.

## 1. Repositório

`diegoarcanjo35/Eleve-PDF` — `C:\Users\Windows 11\Documents\GitHub\Eleve-PDF`

## 2. Branch

`main`

## 3. HEAD inicial (antes de qualquer alteração desta sessão)

`12b2bbd674ffeee118498cb16874065eba6e7988` — `Criação - 01` (exatamente o commit citado como fonte de verdade na ordem de correção).

## 4. `git status --short` inicial

Vazio — a árvore de trabalho estava limpa e idêntica ao HEAD `12b2bbd` antes de qualquer edição desta sessão (confirmado antes de tocar em qualquer arquivo).

## 5–6. Causa de cada bloqueio e correção implementada

### Bloqueio 1 — Alegações falsas sobre preservação estrutural na divisão

**Causa:** o README e a interface afirmavam que "formulários e links são preservados em todos os níveis", sem separar compactação (que preserva) de divisão (que não preserva estruturas de catálogo), e sem nenhuma verificação automatizada disso.

**Correção:**
- Criado `src/lib/structuralAnalysis.ts` (usa `pdf-lib`, roda só dentro do worker) com `analyzePdfStructure(doc)`, que detecta: AcroForm, campos de assinatura digital, Outlines, destinos nomeados (Names/Dests), metadados do catálogo, anotações Link e Widget por página.
- Criado `src/lib/structuralFindings.ts` (tipos + `hasSplitRiskyStructures`, sem dependência de `pdf-lib`) para o thread principal poder decidir a UI sem herdar o peso da biblioteca de PDF (ver item sobre tamanho de bundle abaixo).
- **Experimento reproduzível** (`src/lib/__tests__/structuralAnalysis.test.ts`) provou, com um PDF real contendo AcroForm + outline + destino nomeado + link, exatamente o que a divisão preserva e o que não preserva — documentado na tabela do README (seção "O que a DIVISÃO garante"). Resumo: conteúdo de página e anotações Link sobrevivem; AcroForm, Outlines e Names/Dests **não** sobrevivem ao catálogo de cada parte; um campo de formulário (Widget) fica visualmente presente mas deixa de estar registrado como formulário funcional.
- A validação (`src/lib/validation.ts`) agora roda essa análise logo após o upload e devolve `structure` no resultado.
- A interface (`src/App.tsx`) exibe um aviso antes de dividir, listando as estruturas detectadas, e **bloqueia o botão "Dividir PDF"** até o usuário marcar um checkbox de confirmação explícita ("Entendo o risco e quero continuar mesmo assim") — reforçado também no lado da lógica (`handleSplit` verifica a confirmação de novo, defesa em profundidade além do botão desabilitado).
- Quando a análise estrutural falha por qualquer motivo, o resultado é tratado como potencialmente arriscado (`UNKNOWN_STRUCTURAL_FINDINGS`) — nunca se afirma ausência de risco sem certeza.
- README reescrito para nunca mais dizer "estrutura integralmente preservada" sem qualificar compactação vs. divisão.

### Bloqueio 2 — Compactação insegura de JPEG

**Causa:** o código recodificava qualquer imagem com filtro `DCTDecode` sem checar `ColorSpace`, `BitsPerComponent`, `SMask`, `Mask` ou `DecodeParms`, e reaproveitava o dicionário original (potencialmente incompatível) no novo objeto.

**Correção** (`src/lib/pdfCompress.ts`, função `checkJpegEligibility`):
- Portão de elegibilidade que só permite recompressão quando **todos** os critérios abaixo são verdadeiros: filtro único `DCTDecode`; `ColorSpace` resolvido é `/DeviceRGB`; `BitsPerComponent` é 8; sem `/SMask`; sem `/Mask`; sem `/Decode` nem `/DecodeParms`; `/Width`/`/Height` presentes e válidos.
- O novo dicionário da imagem recomprimida é **construído do zero** (não copiado do original) com só os campos válidos para o JPEG RGB de 8 bits gerado: `Type`, `Subtype`, `Filter`, `ColorSpace`, `BitsPerComponent`, `Width`, `Height`, `Length`.
- **Bug real encontrado e corrigido durante esta correção:** o código original (e minha primeira tentativa de fixture de teste) usava `Object.fromEntries(dict.entries())` para copiar o dicionário original — mas as chaves de `dict.entries()` são instâncias de `PDFName`, cuja coerção implícita para string de chave de objeto JS produz um nome PDF **escapado incorretamente** (ex.: a chave vira `/#2FSubtype` em vez de `/Subtype`), fazendo com que absolutamente nenhum campo do dicionário original fosse realmente preservado por esse spread — silenciosamente. Construir o dicionário novo do zero, como a correção acima já fazia por outro motivo, elimina esse bug de raiz.
- 9 motivos de skip distintos, nunca um genérico: `unsupported-filter`, `unsupported-color-space`, `soft-mask-present`, `mask-present`, `unsupported-bits-per-component`, `unsupported-decode-params`, `decode-failed`, `encode-unsupported`, `no-gain`.

### Bloqueio 3 — Resultado maior escondido como "redução zero"

**Causa:** `Math.max(0, originalBytes - finalBytes)` escondia um aumento de tamanho e ainda oferecia o arquivo maior para download.

**Correção** (`src/lib/pdfCompress.ts`): ao final, o tamanho do documento processado é comparado, em bytes, com o original. Se não ficou estritamente menor, a função devolve o **arquivo original intacto, byte a byte** (`bytes.slice()` do input), com um campo `outcome: "no-gain-original-preserved"` explícito (o outro valor possível é `"reduced"`). Quando não há ganho, `imagesRecompressed` é reportado como `0` mesmo que alguma imagem individual tenha sido recomprimida durante o processo — porque nenhum desses bytes chega a ser entregue ao usuário, e reportar um número positivo seria enganoso.

A interface (`CompressResultView.tsx`) usa esse campo diretamente (não mais um limiar de porcentagem "significativo/insignificante"): mostra "Redução: Nenhuma", o texto "o arquivo original foi mantido", e o botão passa a dizer "Baixar arquivo original".

Testes: `src/lib/__tests__/pdfCompress.test.ts` (bloco "regra geral") cobrem saída menor, saída não-menor com preservação byte a byte, e que `imagesRecompressed` nunca é reportado > 0 num resultado `no-gain`. O teste E2E "sem ganho real" baixa o arquivo e compara `Buffer.compare` com o fixture original — `0` (idêntico).

### Bloqueio 4 — Teste E2E de divisão não executava uma divisão real

**Causa:** o teste usava um PDF de 6,68 KB com limite de 1 MB — sempre 1 parte.

**Correção:** `tests/e2e/elevepdf.spec.ts` agora usa `large-unique-images.pdf` (fixture nova, 5 páginas com imagens JPEG grandes e únicas, ~490 KB) com um limite personalizado de 150 KB, forçando **5 partes reais**. O teste:
1. envia o PDF real e escolhe o limite personalizado;
2. confirma na interface que mais de uma parte foi gerada;
3. baixa o ZIP e o abre de verdade com `JSZip` (`tests/e2e/elevepdf.spec.ts` + biblioteca já usada pelo app);
4. confirma a quantidade de entradas `.pdf` e a nomenclatura sequencial exata;
5. reabre **cada** PDF do ZIP com `pdf-lib` e confirma que é um documento válido;
6. confirma que o tamanho real de cada entrada dentro do ZIP respeita o limite pedido;
7. soma as páginas de todas as partes e confirma o total (5, nenhuma perdida/duplicada);
8. confirma a **ordem** das páginas via um marcador de texto real (`pagina-numero-N`) extraído do stream de conteúdo decodificado de cada página (não apenas a contagem).

Um segundo teste cobre o caso de página isolada maior que o limite (limite de 64 KB, menor que qualquer página sozinha): confirma o badge "ACIMA DO LIMITE" na interface, baixa o ZIP, reabre cada parte (continuam PDFs válidos, com exatamente 1 página cada — nenhuma foi cortada).

### Bloqueio 5 — Teste E2E de compactação era superficial

**Causa:** o teste só checava a presença dos textos "Tamanho original/final/Redução", sem provar compactação real.

**Correção:** dois testes parametrizados (Equilibrada e Máxima) em `tests/e2e/elevepdf.spec.ts`, cada um:
1. envia `with-images.pdf` (real, 6 páginas, 1 imagem JPEG elegível compartilhada);
2. seleciona o nível explicitamente;
3. lê os números exibidos na interface e confirma, por cálculo, que o tamanho final é estritamente menor que o original;
4. confirma o texto "1 de 1" em "imagens recomprimidas";
5. baixa o PDF processado e confirma que o **arquivo baixado** também é menor (não só o número mostrado na tela);
6. reabre com `pdf-lib`: 6 páginas, na mesma ordem (via os marcadores `pagina-numero-N`);
7. confirma que cada página ainda tem um recurso de fonte no `Resources` (prova de que não foi rasterizada) e que o texto "pagina-numero-" aparece no stream de conteúdo decodificado (prova de texto pesquisável, não apenas alegado).

O caso "sem ganho" está coberto no bloco de compactação (ver Bloqueio 3).

### Bloqueio 6 — Fixtures insuficientes para imagens

**Causa:** só havia um JPEG RGB simples.

**Correção** — novas fixtures em `src/test/pdfFixtures.ts` (para os testes unitários em Node) e `tests/fixtures/` (para E2E em navegador real):
- JPEG RGB simples elegível: `makePdfWithJpegImage` (já existia).
- Grayscale, CMYK, `BitsPerComponent` inválido, com SMask, com Mask, com DecodeParms customizado: `makeImagePdfWithDictOverrides(overrides)` — constrói um PDF com uma imagem JPEG **real e válida**, mas com o **dicionário** do XObject deliberadamente alterado. Essa é a técnica escolhida porque o portão de elegibilidade decide *só olhando o dicionário*, antes de qualquer tentativa de decodificação — então isso testa a lógica de decisão de forma real e determinística, sem depender de gerar pixels genuinamente grayscale/CMYK (que `jpeg-js`, a única biblioteca de codificação JPEG pura-JS disponível sem dependências nativas, não suporta gerar). **Impossibilidade declarada, conforme pedido:** não foi possível gerar uma fixture com pixels CMYK/grayscale reais no ambiente disponível (Node, sem `libjpeg`/`sharp`/pacotes nativos); a alternativa tecnicamente equivalente para testar o *código de decisão* (não a decodificação de pixels) foi adotada, e é declarada aqui abertamente.
- Imagem `FlateDecode` (PNG real): `makePdfWithFlateImage`, com um encoder PNG mínimo próprio (usa `node:zlib`, sem bibliotecas de imagem externas).
- Estruturas sensíveis para o Bloqueio 9: `makePdfWithSensitiveStructures`, `makePdfWithSignatureField`.
- Imagem que ficaria maior após recompressão ("no-gain"): não é possível testar isso em Node (falta `OffscreenCanvas`); coberto pelo teste E2E "sem ganho real" citado acima, que exercita o pipeline completo em um navegador real.

Cada fixture tem um teste correspondente que confirma: o caminho seguro é recomprimido; os caminhos não comprovadamente seguros são preservados com o motivo de skip correto; o PDF final continua válido (`PDFDocument.load` bem-sucedido, contagem de páginas correta).

### Bloqueio 7 — Contradição sobre assinaturas digitais

**Correção:** README, interface e este relatório usam consistentemente a mesma redação: a **aparência** de uma assinatura pode permanecer; a **validade criptográfica** é sempre invalidada por qualquer reserialização ou divisão, inclusive no nível Leve. Quando `hasDigitalSignatureFields` é detectado, a interface mostra esse aviso explicitamente antes do processamento (`src/App.tsx`).

### Bloqueio 8 — Corrida na validação de arquivos

**Causa:** nenhum controle de identidade de operação — uma resposta de validação atrasada podia sobrescrever o estado de um arquivo selecionado depois.

**Correção** (`src/App.tsx`): um `fileTokenRef` é incrementado a cada nova seleção de arquivo e a cada remoção. `handleFileSelected` captura o token no início e checa, em cada ponto de retomada assíncrona (depois de `arrayBuffer()` e depois da resposta do worker), se o token ainda é o mais recente antes de aplicar qualquer atualização de estado — do contrário, a resposta é descartada silenciosamente (é uma operação já superada). `handleRemove` incrementa o token, invalidando qualquer validação em andamento.

### Bloqueio 9 — Testes de estruturas sensíveis

**Correção:** `src/lib/__tests__/structuralAnalysis.test.ts` (6 testes) comprova, com PDFs reais: detecção de AcroForm/outline/destino nomeado/link/Widget; ausência de falsos positivos num PDF de texto simples; detecção de campo de assinatura (`FT /Sig`); e — o mais importante — o que sobrevive e o que não sobrevive à divisão, usando `splitPdfBySize` de verdade sobre um PDF com essas estruturas. Não afirma que tudo é preservado; comprova exatamente o contrário onde é o caso.

### Bloqueio 10 — Correções documentais e de relatório

**Correção:** README reestruturado com as seções "O que a COMPACTAÇÃO garante" e "O que a DIVISÃO garante — e o que NÃO garante" (com a tabela comprovada pelo experimento), separando claramente garantido/testado, preservado em casos específicos, não garantido, e invalidado (assinaturas). Este relatório traz a contagem exata de testes por suíte (ver item 18), corrigindo a imprecisão do relatório da v0.1.

## 7. Arquivos alterados

Ver `git diff --stat` no item 30. Resumo: `src/lib/pdfCompress.ts` (portão de elegibilidade + no-gain), `src/lib/validation.ts` (roda análise estrutural), `src/App.tsx` (corrida de validação + avisos estruturais), `src/components/CompressResultView.tsx` (outcome honesto), `src/workers/pdf.worker.ts` + `src/types/worker.ts` (novos campos no protocolo), `src/test/pdfFixtures.ts` + `scripts/generate-fixtures.ts` (novas fixtures), `tests/e2e/elevepdf.spec.ts` (testes reais reforçados), `README.md`, `tsconfig.node.json` (passou a checar `tests/e2e/**/*.ts`). Novos arquivos: `src/lib/structuralAnalysis.ts`, `src/lib/structuralFindings.ts`, `src/lib/__tests__/structuralAnalysis.test.ts`, `tests/e2e/pdfInspect.ts`.

**Efeito colateral corrigido durante o trabalho:** as duas vezes em que uma dependência de `pdf-lib` vazou para o bundle do thread principal (via `structuralAnalysis.ts` importado por engano em vez de `structuralFindings.ts` no `App.tsx`) foram detectadas pelo próprio processo de build (o bundle principal saltou de ~261 KB para ~697 KB) e corrigidas na mesma sessão — confirmado de volta a ~263 KB no build final.

## 8. Estratégia segura para JPEG

Ver Bloqueio 2 acima e a documentação em `src/lib/pdfCompress.ts` (comentário de `checkJpegEligibility`).

## 9. Critérios usados para considerar uma imagem elegível

Todos obrigatórios simultaneamente: filtro exclusivamente `DCTDecode`; `ColorSpace` resolvido (via `context.lookup` se indireto) é `/DeviceRGB`; `BitsPerComponent` é `8`; ausência de `/SMask`; ausência de `/Mask`; ausência de `/Decode` e `/DecodeParms`; `/Width` e `/Height` presentes e numéricos maiores que zero.

## 10. Novos motivos de skip

`unsupported-filter`, `unsupported-color-space`, `soft-mask-present`, `mask-present`, `unsupported-bits-per-component`, `unsupported-decode-params`, `decode-failed`, `encode-unsupported`, `no-gain` — ver descrição de cada um nos comentários de `ImageSkipReason` em `src/lib/pdfCompress.ts`.

## 11. Comportamento quando não há ganho

`outcome: "no-gain-original-preserved"`; `bytes` é uma cópia exata do input; `finalBytes === tamanho original`; `imagesRecompressed` forçado a `0`; a interface mostra "Redução: Nenhuma" e "arquivo original foi mantido", e o botão de download baixa o original.

## 12. Comportamento com resultado maior

Idêntico ao item 11 — "maior" e "igual" caem na mesma regra (`outBytes.byteLength >= bytes.byteLength`), então um resultado maior nunca é oferecido como se fosse menor.

## 13. Tratamento de assinatura digital

Ver Bloqueio 7.

## 14. Tratamento de formulários, links e estruturas globais

Ver Bloqueio 1 e a tabela no README ("O que a DIVISÃO garante").

## 15. Correção da corrida de validação

Ver Bloqueio 8.

## 16. Fixtures criadas

`makePdfWithFlateImage`, `makeImagePdfWithDictOverrides` (+ variantes ColorSpace/BitsPerComponent/SMask/Mask/DecodeParms), `makePdfWithSensitiveStructures`, `makePdfWithSignatureField` (em `src/test/pdfFixtures.ts`, Node); `large-unique-images.pdf` (recriada com marcador de página + imagens maiores), `sensitive-structures.pdf` (nova) em `tests/fixtures/` (E2E, navegador real).

## 17. Testes adicionados

- `src/lib/__tests__/pdfCompress.test.ts`: de 7 para 16 testes (portão de elegibilidade, regra de no-gain/maior).
- `src/lib/__tests__/structuralAnalysis.test.ts`: novo, 6 testes.
- `tests/e2e/elevepdf.spec.ts`: de 6 para 10 testes por projeto de navegador (20 no total, chromium + mobile-chromium).

## 18. Quantidade exata de testes por suíte (corrigindo a imprecisão da v0.1)

| Arquivo | Testes |
|---|---|
| `src/lib/__tests__/pdfCompress.test.ts` | 16 |
| `src/lib/__tests__/format.test.ts` | 11 |
| `src/lib/__tests__/filenames.test.ts` | 7 |
| `src/lib/__tests__/pdfSplit.test.ts` | 7 |
| `src/lib/__tests__/validation.test.ts` | 7 |
| `src/lib/__tests__/structuralAnalysis.test.ts` | 6 |
| `src/components/__tests__/UploadZone.test.tsx` | 3 |
| `src/components/__tests__/FileCard.test.tsx` | 3 |
| **Total unitários (Vitest)** | **60** |
| `tests/e2e/elevepdf.spec.ts` × 2 projetos (chromium, mobile-chromium) | **20** |

## 19. Resultado dos testes unitários

```
npm run gen:fixtures && npm test
 Test Files  8 passed (8)
      Tests  60 passed (60)
```

## 20. Resultado dos testes E2E

Chromium instalado via `npx playwright install --with-deps chromium` nesta sessão (comando registrado).

```
npm run build && npx playwright test
Running 20 tests using 2 workers
  20 passed (24.3s)
```

## 21. Evidência de que houve divisão em múltiplas partes

Teste "divide em múltiplas partes reais...": PDF de 5 páginas (`large-unique-images.pdf`, ~490 KB) dividido com limite de 150 KB → **5 partes reais**, cada uma reaberta com `pdf-lib` e confirmada válida.

## 22. Conteúdo e tamanhos dos arquivos do ZIP

Do mesmo teste (medido pelo teste, não estimado): `large-unique-images-parte-01.pdf` a `-05.pdf`, cada uma com 1 página, cada uma ≤ 150 KB (limite pedido), soma de páginas = 5, ordem confirmada via marcador de texto real extraído do stream de conteúdo: `[1, 2, 3, 4, 5]`.

## 23. Evidência de compactação real

Teste "nível Equilibrada"/"nível Máxima": `with-images.pdf` processado, tamanho final lido da interface **e** do arquivo baixado, ambos estritamente menores que o original; "1 de 1" imagens recomprimidas; PDF reaberto com 6 páginas na ordem original; cada página com recurso de fonte presente (não rasterizada) e o marcador de texto ainda encontrável no stream de conteúdo decodificado.

## 24. Evidência de preservação do original quando não há ganho

Teste "sem ganho real": `simple-1-page.pdf` compactado no nível Leve → interface mostra "Redução: Nenhuma" e "arquivo original foi mantido"; o arquivo baixado, comparado byte a byte (`Buffer.compare`) com o fixture original, é **idêntico** (retorno `0`).

## 25. Resultado do TypeScript

```
npm run typecheck
> tsc -b --noEmit
(sem saída — 0 erros)
```

`tsconfig.node.json` agora também inclui `tests/e2e/**/*.ts`, então os testes E2E passaram a ser checados pelo `tsc`, não só compilados de forma permissiva pelo runner do Playwright.

## 26. Resultado do lint

```
npm run lint
> eslint .
(sem saída — 0 erros, 0 avisos)
```

## 27. Resultado do build

```
npm run build
✓ 48 modules transformed.
dist/index.html                            0.72 kB
dist/assets/pdf.worker-*.js              804.94 kB
dist/assets/pdf.worker.min-*.mjs       1,375.84 kB
dist/assets/index-*.css                    9.27 kB │ gzip:  2.55 kB
dist/assets/index-*.js                   263.56 kB │ gzip: 84.32 kB
✓ built em ~6s
```

## 28. Resultado do `npm audit`

```
npm ci && npm audit
found 0 vulnerabilities
```

## 29. Limitações remanescentes

- Fixtures grayscale/CMYK usam dicionário deliberadamente alterado sobre uma imagem JPEG RGB real (não pixels genuinamente grayscale/CMYK) — impossibilidade técnica declarada no Bloqueio 6, sem depender de bibliotecas nativas de imagem indisponíveis no ambiente.
- O cenário "imagem recomprimida fica maior" só é exercitável em navegador real (falta `OffscreenCanvas` em Node/jsdom); coberto pelo teste E2E de "sem ganho", não por um teste unitário isolado desse caso específico de imagem.
- Comportamento de link interno (`Dest`) apontando para uma página que ficou em outra parte da divisão continua **não garantido** (o objeto de destino é copiado como órfão) — documentado explicitamente no README como tal, não simulado como resolvido.
- Cancelamento durante a compactação continua não implementado (só a divisão tem cancelamento real) — já declarado como limitação na v0.1, sem alteração nesta correção (fora do escopo dos 10 bloqueios).
- Testes em Firefox/Safari reais continuam fora do escopo desta correção (Chromium desktop + mobile via Playwright, como na v0.1).

## 30. `git diff --stat`

```
 README.md                             |  36 +++--
 scripts/generate-fixtures.ts          |  67 ++++++++-
 src/App.tsx                           |  82 ++++++++++-
 src/components/CompressResultView.tsx |  24 ++--
 src/index.css                         |  18 +++
 src/lib/__tests__/pdfCompress.test.ts | 116 ++++++++++++++-
 src/lib/pdfCompress.ts                | 170 +++++++++++++++++++---
 src/lib/validation.ts                 |  21 ++-
 src/test/pdfFixtures.ts               | 258 +++++++++++++++++++++++++++++++++-
 src/types/worker.ts                   |   6 +-
 src/workers/pdf.worker.ts             |   9 +-
 tests/e2e/elevepdf.spec.ts            | 211 +++++++++++++++++++++++----
 tsconfig.node.json                    |   2 +-
 13 files changed, 941 insertions(+), 79 deletions(-)
```

Mais 4 arquivos novos (não aparecem em `diff --stat` de um arquivo já rastreado, pois nunca existiram antes): `src/lib/structuralAnalysis.ts`, `src/lib/structuralFindings.ts`, `src/lib/__tests__/structuralAnalysis.test.ts`, `tests/e2e/pdfInspect.ts`.

## 31. `git status --short` final

```
 M README.md
 M RELATORIO-AUDITORIA.md
 M scripts/generate-fixtures.ts
 M src/App.tsx
 M src/components/CompressResultView.tsx
 M src/index.css
 M src/lib/__tests__/pdfCompress.test.ts
 M src/lib/pdfCompress.ts
 M src/lib/validation.ts
 M src/test/pdfFixtures.ts
 M src/types/worker.ts
 M src/workers/pdf.worker.ts
 M tests/e2e/elevepdf.spec.ts
 M tsconfig.node.json
?? src/lib/__tests__/structuralAnalysis.test.ts
?? src/lib/structuralAnalysis.ts
?? src/lib/structuralFindings.ts
?? tests/e2e/pdfInspect.ts
```

(`RELATORIO-AUDITORIA.md`, este arquivo, aparece como modificado por ser o próprio relatório sendo reescrito nesta sessão.)

## 32. Confirmação de que não houve commit

**Confirmado.** `git log --oneline` continua mostrando `12b2bbd "Criação - 01"` como HEAD, idêntico ao HEAD inicial citado na ordem de correção. Nenhum `git add` nem `git commit` foi executado nesta sessão.

## 33. Confirmação de que não houve push

**Confirmado.** Nenhum `git push` foi executado. O remote `origin` não foi tocado.

## 34. Confirmação de que não houve deploy

**Confirmado.** Nenhum deploy, domínio ou hospedagem foi configurado. Servidores locais (`vite build` + `vite preview`, e o `webServer` do Playwright) rodaram apenas em `localhost` para os testes e foram encerrados ao final.

## 35. Confirmação de que nenhum outro repositório foi alterado

**Confirmado.** Todas as edições desta sessão ficaram dentro de `C:\Users\Windows 11\Documents\GitHub\Eleve-PDF`. Nenhum outro projeto, repositório ou arquivo fora desse diretório foi modificado.

---

## Instruções para reproduzir esta correção localmente

```bash
cd "C:\Users\Windows 11\Documents\GitHub\Eleve-PDF"
npm ci
npm run gen:fixtures
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install --with-deps chromium   # primeira vez apenas
npx playwright test
npm audit
```

---

## STATUS DA ENTREGA: PRONTA PARA NOVA AUDITORIA
