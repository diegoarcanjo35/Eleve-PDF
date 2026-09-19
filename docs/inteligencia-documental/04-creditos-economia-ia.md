# Créditos e Economia de IA — Inteligência Documental (ElevePDF)

> Fase 00 — Fundação. Modelo conceitual. **Nenhum preço, nenhuma
> quantidade de crédito, nenhuma conversão token→crédito, nenhuma
> cobrança é definida nesta fase.**

## 1. Separação fundamental: Plano vs. Créditos

> **Plano (entitlement) define quais funcionalidades o usuário está
> autorizado a utilizar.**
> **Créditos definem quanto ele pode consumir dentro das funcionalidades
> às quais já possui acesso.**

Estes dois conceitos são **independentes**, mas a independência **não é
simétrica** (ver ADR `0004-plano-separado-de-creditos.md`): possuir
créditos **nunca** desbloqueia, por si só, uma funcionalidade de um plano
superior. Exemplo: um usuário do plano IA sem acesso a uma funcionalidade
exclusiva do plano PRO não ganha esse acesso só por ter comprado créditos
avulsos — o que falta é autorização de plano, não saldo. O usuário nunca
vê "tokens" — o conceito comercial é sempre **Créditos Eleve IA**.

### 1.1 Créditos avulsos
Quando os créditos mensais do plano se esgotam, o usuário deve poder,
futuramente, comprar créditos adicionais **sem alterar o plano** — mas
esses créditos avulsos só permitem **continuar consumindo funcionalidades
às quais o plano já dá acesso**, nunca destravam uma funcionalidade nova.
Este é um requisito de desenho desde já (a separação acima é o que torna
isso possível), mesmo que a implementação de compra avulsa seja de uma
fase muito posterior.

### 1.2 Uma terceira dimensão — não confundir com saldo de créditos
Trials, promoções, add-ons, entitlement temporário, ou a compra específica
de acesso a uma funcionalidade são, conceitualmente, uma **terceira
dimensão de autorização comercial** — distinta tanto do plano "de base"
quanto do saldo de créditos. Nenhuma delas é decidida ou modelada nesta
fase; citadas aqui só para que, no futuro, não sejam confundidas com
consumo de créditos.

## 2. Telemetria por operação (formato conceitual)

Toda operação de IA (classificação, embeddings, pergunta, resumo,
correlação, comparação, análise, adequação, OCR) deve ser registrável com,
no mínimo, estes campos conceituais — o mesmo espírito de
`analytics_events` hoje, mas para o domínio de IA:

- usuário
- organização (quando aplicável)
- documento (quando aplicável)
- tipo da operação (categoria fechada — mesma lista do roteamento de IA no
  blueprint técnico)
- fornecedor
- modelo
- tokens de entrada
- tokens de saída
- embeddings (quantidade/dimensão, quando aplicável)
- OCR (páginas processadas, quando aplicável)
- armazenamento consumido (quando aplicável)
- custo real (valor monetário medido, não estimado)
- créditos cobrados (valor no vocabulário do usuário)
- timestamp

Este registro é o que viabiliza tanto o benchmark econômico (seção 4)
quanto a auditoria de margem (seção 3). Não é opcional a partir do momento
em que a primeira operação de IA real for integrada — sem ele, não existe
como validar se o preço de créditos cobre o custo real.

## 3. Comparação créditos cobrados × custo real (margem)

O sistema futuro precisa conseguir, a qualquer momento, comparar:

```
custo real da operação (via telemetria, seção 2)
         vs.
créditos cobrados do usuário por essa operação
```

agregado por: documento, operação, usuário, organização, modelo/fornecedor,
funcionalidade. Esta comparação é o que permite decidir, com dados reais
(não achismo), se a conversão crédito→custo está correta — mas a
**conversão em si não é definida nesta fase** (depende do benchmark,
seção 4, que ainda não foi executado).

## 4. Benchmark econômico futuro — metodologia

Documentos de referência para medição (tamanhos aproximados):
10, 50, 100, 300 e 1.000 páginas.

Operações a medir por tamanho de documento:
indexação, pergunta, resumo, busca, correlação, comparação, Raio-X,
análise contratual, adequação, OCR.

Para cada combinação (tamanho × operação), registrar via a telemetria da
seção 2: tokens, tempo, modelo, custo, armazenamento, retrieval,
embeddings. **Este benchmark ainda não foi executado** — nenhum número
real existe hoje, porque nenhum provedor foi integrado. Este documento só
formaliza *como* ele será conduzido quando a Fase 01 (ou a fase em que o
primeiro provedor real for integrado) tiver dados de verdade para gerar.

Só depois do benchmark real serão definidos: preços, créditos, limites,
margens, pacotes avulsos — nesta ordem de dependência (benchmark primeiro,
número comercial depois, nunca o contrário).

## 5. Planos futuros (conceituais, sem número)

FREE (aquisição/experimentação), IA (uso individual com biblioteca e
recursos inteligentes), PRO (análise avançada, correlações, comparação,
Raio-X, adequações), BUSINESS (organizações/equipes), ENTERPRISE
(configurações e limites personalizados). Nenhum preço, nenhum limite
numérico é definido nesta fase — dependem do benchmark da seção 4.

## 6. Relação com B2B (sem implementar)

O modelo de créditos precisa, no desenho, não impedir que uma organização
tenha créditos compartilhados entre membros ou políticas de consumo por
departamento/membro — mas nenhuma dessas políticas é definida nesta fase.
Faixas comerciais como "5/15/50 usuários" mencionadas na visão de produto
são hipóteses comerciais futuras, não regras arquiteturais — não devem ser
codificadas em nenhum lugar como constante ou limite fixo.

## 7. O que este documento deliberadamente não faz

Não define quantos créditos custa qualquer operação. Não define preço de
plano ou de pacote avulso. Não define taxa de conversão token→crédito. Não
define política de expiração de créditos mensais. Todos esses itens
dependem do benchmark real (seção 4) e ficam registrados como decisão em
aberto em `decisoes-em-aberto.md`.
