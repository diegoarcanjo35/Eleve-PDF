# ADR 0005 — Persistência explícita vs. sessão temporária

**Status**: Aceito (fundação arquitetural, Fase 00)
**Data**: Fase 00 — Fundação da Inteligência Documental

## Contexto

A Inteligência Documental introduz, pela primeira vez no ElevePDF, a
possibilidade de um documento do usuário persistir além de uma única
operação — a Biblioteca. Isso é uma mudança de natureza em relação às
ferramentas clássicas (Compactar/Dividir/Juntar), que nunca retêm nada
além de eventos de Analytics pseudônimos. Sem uma regra explícita, existe
o risco de a persistência se tornar o comportamento padrão implícito (ex.:
"já que processamos remotamente, por que não guardar?") em vez de uma
escolha consciente do usuário.

## Decisão

Existem dois regimes de privacidade distintos e o padrão é sempre o mais
restritivo:

- **Sessão rápida** (padrão): upload → processamento → uso → expiração →
  exclusão. Nenhuma persistência além do necessário para a sessão em
  curso.
- **Biblioteca**: só existe mediante **ação explícita** do usuário optando
  por persistir aquele documento especificamente. Nunca é o comportamento
  padrão de abrir ou usar um documento no domínio remoto.

Esta decisão reforça, no nível de dados, o princípio de privacidade de
dois domínios já estabelecido no documento mestre: mesmo dentro do
domínio remoto (onde processamento já não é 100% local), a persistência
em si continua sendo opt-in, nunca opt-out.

## Consequências

- Positivas: minimiza dados retidos por padrão, alinhado ao princípio já
  praticado no Analytics atual (nada é coletado antes do consentimento
  explícito); reduz superfície de risco de segurança (seção 4 de
  `03-seguranca-privacidade-isolamento.md`) simplesmente por ter menos
  documentos persistidos por padrão para proteger.
- Negativas / custo: exige que a UX de qualquer funcionalidade de IA
  distinga claramente, na interface, entre "está processando agora" e
  "isto vai ficar guardado" — não pode ser uma nuance escondida em texto
  pequeno; a política de expiração da sessão rápida (por quanto tempo o
  documento processado fica acessível antes de expirar) ainda não foi
  decidida (`decisoes-em-aberto.md`, item 11) e precisa sê-lo antes da
  primeira implementação real da sessão rápida.
- Não decidido por este ADR: o mecanismo técnico de expiração automática,
  nem o tempo exato de retenção da sessão rápida.
