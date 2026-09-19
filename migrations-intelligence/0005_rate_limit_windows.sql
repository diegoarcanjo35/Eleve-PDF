-- Migration 0005 (Inteligência Documental) — Fase 01, Sprint 01E.1.
--
-- Tabela dedicada ao rate limit distribuído e autoritativo
-- (functions/_shared/distributedRateLimit.ts) — nunca compartilhada com
-- Analytics (`analytics_events`) nem com `intelligence_sessions`/
-- `intelligence_chunks`. Guarda só o mínimo necessário para um contador de
-- janela fixa:
--
--   rate_key     — chave pseudonimizada:
--                  "<operação>:<HMAC-SHA256(IP)>[:<sessionId>]:<janela>".
--                  NUNCA contém o IP bruto — só o resultado do HMAC (ver
--                  functions/_shared/networkIdentity.ts), derivado com o
--                  secret RATE_LIMIT_HMAC_KEY (nunca commitado; configuração
--                  remota fora do escopo desta sprint — ver relatório).
--   window_start — início da janela (ISO 8601 UTC), só para depuração e uma
--                  eventual limpeza física futura (débito técnico
--                  registrado, mesma classe já aceita para sessões
--                  expiradas em intelligence_sessions — ver migration 0001).
--   count        — contador da janela, incrementado atomicamente via
--                  INSERT ... ON CONFLICT DO UPDATE ... WHERE count < ?.
--   updated_at   — último consumo desta janela (ISO 8601 UTC).
--
-- Nenhuma pergunta, resposta, texto de documento, capability, ou qualquer
-- outro conteúdo do produto passa perto desta tabela.

CREATE TABLE IF NOT EXISTS intelligence_rate_limit_windows (
  rate_key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
