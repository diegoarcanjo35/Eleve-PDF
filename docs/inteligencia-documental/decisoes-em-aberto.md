# Decisões em Aberto — Inteligência Documental (ElevePDF)

> Fase 00 — Fundação. Nenhum item desta lista é resolvido nesta fase.
> Alternativas e trade-offs são apresentados como referência para a
> decisão do PO, nunca como recomendação vinculante ou escolha implícita.
> O executor não seleciona vencedor.

## 1. Provedor(es) de LLM

Não decidido. A arquitetura-alvo (blueprint técnico, seção 5) exige
desacoplamento de fornecedor desde o início (ADR `0001`), justamente para
que esta decisão possa ser adiada e até revisitada por categoria de tarefa
sem exigir reescrita. Trade-off geral: um único fornecedor simplifica
integração e cobrança, mas reduz a capacidade de rotear tarefas simples
para modelos mais baratos (seção 6 do documento mestre / seção 5 do
blueprint).

## 2. Provedor/modelo de embeddings

Não decidido. Pode ou não ser o mesmo fornecedor do LLM principal —
embeddings costumam ter mercado e preço próprios, independentes do
fornecedor de geração de texto.

## 3. Solução de índice vetorial

Não decidido. Opções genéricas a considerar quando chegar a hora: banco
vetorial dedicado (serviço externo), extensão vetorial sobre um banco
relacional já em uso, ou oferta vetorial nativa de uma plataforma de nuvem
já usada pelo projeto. Trade-off central: simplicidade operacional
(reaproveitar infraestrutura já paga/gerenciada) vs. desempenho/escala
especializados em busca por similaridade.

## 4. OCR

Não decidido — nem provedor, nem se será um serviço externo dedicado ou
capacidade de um dos provedores de LLM/visão já escolhidos para outra
finalidade. Explicitamente fora de escopo até a fase L (ver documento
mestre).

## 5. Autenticação

Não decidido. Nenhuma biblioteca ou serviço de auth está integrado hoje —
o único mecanismo de identidade existente no projeto (Cloudflare Access,
`functions/_shared/accessAuth.ts`) protege o painel administrativo interno,
não é uma solução de contas de usuário do produto. Precisa ser decidido
antes da Fase 01 poder ter qualquer conceito real de `users`/dono de
documento.

## 6. Pagamentos

Não decidido — nem provedor, nem modelo (assinatura recorrente, pré-pago,
híbrido).

## 7. Preços

Não decidido — depende do benchmark econômico (`04-creditos-economia-ia.md`,
seção 4), que ainda não foi executado.

## 8. Quantidade de créditos por plano

Não decidido — mesma dependência do item 7.

## 9. Limites por plano (armazenamento, número de documentos, etc.)

Não decidido — mesma dependência do item 7. Faixas numéricas hipotéticas
mencionadas na visão de produto (ex.: número de colaboradores B2B) não são
regra arquitetural.

## 10. Armazenamento por plano

Não decidido — depende de 6, 7 e da solução de armazenamento de objetos
(item 15).

## 11. Retenção da sessão temporária (sessão rápida)

Não decidido — quanto tempo um documento processado em modo "sessão
rápida" (sem biblioteca) pode permanecer acessível antes de expirar
automaticamente.

## 12. Política de expiração dos créditos

Não decidido — se créditos mensais não usados expiram, acumulam, ou uma
combinação (ex.: parte acumula, parte expira).

## 13. Preço dos créditos avulsos

Não decidido — mesma dependência do item 7.

## 14. Limites B2B (usuários por organização, etc.)

Não decidido. Explicitamente marcado como hipótese comercial, não regra
arquitetural — ver documento mestre e blueprint, seção "Business".

## 15. Armazenamento de objetos (para o PDF em si, no domínio remoto)

Não decidido — onde o PDF/artefatos derivados ficam armazenados quando o
usuário opta por processamento remoto ou biblioteca persistente. Trade-off
central: usar um serviço de armazenamento de objetos já dentro do mesmo
provedor de infraestrutura atual (menor superfície operacional nova) vs.
uma solução dedicada a esse propósito. Relevante também para a garantia de
exclusão física (`02-modelo-de-dados.md`, seção 4) — a solução escolhida
precisa suportar exclusão verificável, não só lógica.

## 16. Política de histórico das conversas

Não decidido — se e por quanto tempo o conteúdo integral de
`conversation`/`message` é retido, e se aparece em log de auditoria B2B
(`03-seguranca-privacidade-isolamento.md`, seção 5). Decisão de privacidade
específica, não deve ser resolvida por omissão.

## 17. Eventual geração de versões revisadas (documento final após adequação)

Não decidido — se o produto chegará a gerar um novo arquivo PDF com as
sugestões de adequação aplicadas, ou se o output fica limitado ao
relatório de revisão (original + sugestão + justificativa). Relacionado à
regra de nunca substituir silenciosamente o documento original (documento
mestre, pilar "Aprimorar") — qualquer geração de versão revisada precisaria
preservar essa regra por desenho, não é uma decisão livre de trade-off
técnico simples.
