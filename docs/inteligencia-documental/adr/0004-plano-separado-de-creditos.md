# ADR 0004 — Plano separado de créditos

**Status**: Aceito (fundação arquitetural, Fase 00)
**Data**: Fase 00 — Fundação da Inteligência Documental

## Contexto

O modelo comercial da Inteligência Documental precisa responder a duas
perguntas distintas: "o que este usuário está autorizado a usar?" (quais
funcionalidades — correlação, comparação, Raio-X, etc., definidas pelo
plano/entitlement) e "quanto ele pode consumir dentro do que já está
autorizado?" (volume de operações de IA, definido pelos créditos).
Modelar as duas como a mesma dimensão (ex.: plano = quantidade fixa de
operações mensais, sem separação) tornaria impossível, por exemplo, vender
um pacote de créditos avulso sem forçar upgrade de plano. Também seria um
erro modelar as duas dimensões como *simetricamente* independentes — isto
é, deixar implícito que ter créditos suficientes bastaria para acessar uma
funcionalidade de um plano superior. As duas coisas precisam ser evitadas.

## Decisão

Plano e Créditos são modelados como dimensões independentes, mas **não
simétricas**:

> **Plano (entitlement) define quais funcionalidades o usuário está
> autorizado a utilizar.**
> **Créditos definem quanto ele pode consumir dentro das funcionalidades
> às quais já possui acesso.**

Consequência direta: possuir créditos **nunca** desbloqueia, por si só,
uma funcionalidade de um plano superior — falta de acesso é resolvida por
mudança de plano (ou por uma terceira dimensão futura de entitlement
pontual — trials, promoções, add-ons, compra específica de funcionalidade
— explicitamente fora do escopo deste ADR), nunca por saldo de créditos.
O usuário nunca vê "tokens" — o vocabulário comercial é sempre "Créditos
Eleve IA". Créditos avulsos (compra adicional sem alterar o plano) são um
requisito de desenho desde já, mas servem só para continuar consumindo
funcionalidades já autorizadas pelo plano — não para destravar
funcionalidades novas.

## Consequências

- Positivas: viabiliza créditos avulsos sem redesenho, sem o risco de
  eles se tornarem um caminho indireto de acesso a funcionalidades pagas
  de um plano superior; permite que planos e políticas de consumo evoluam
  independentemente (ex.: mudar quantos créditos um plano IA inclui por
  mês sem mexer em quais funcionalidades cada plano libera); alinha com o
  requisito de telemetria por operação (`04-creditos-economia-ia.md`), que
  já trata "operação consumida" e "funcionalidade acessível" como
  conceitos separados.
- Negativas / custo: exige duas checagens de autorização em qualquer
  operação futura de IA, nesta ordem — a funcionalidade está no plano?
  (se não, créditos não ajudam) → há créditos suficientes? — em vez de
  uma checagem única; mais uma decisão de implementação a não simplificar
  incorretamente depois (ex.: uma implementação apressada que só checasse
  créditos, sem checar entitlement, reintroduziria exatamente o risco que
  este ADR evita).
- Não decidido por este ADR: preços, quantidade de créditos por plano,
  taxa de conversão, ou o desenho da terceira dimensão de entitlement
  pontual (trials/promoções/add-ons) — todos dependentes do benchmark
  econômico ainda não executado (ver `decisoes-em-aberto.md`, itens 7 e 8)
  ou de decisão comercial futura específica.
