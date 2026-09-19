-- Migration 0001 (Inteligência Documental — D1 dedicado, isolado do D1 de
-- Analytics). Fase 01, Sprint 01B.
--
-- Fundação mínima para provar sessão -> ingestão -> chunking. Schema
-- deliberadamente pequeno e temporário: nenhuma tabela de usuário,
-- organização, plano, crédito, document memory, biblioteca ou conversa é
-- criada aqui (fora de escopo desta sprint — ver docs/inteligencia-documental/).
--
-- IMPORTANTE: esta migration ainda NÃO foi aplicada em nenhum D1 remoto (nem
-- produção nem preview) — o próprio D1 `elevepdf-intelligence` ainda não foi
-- provisionado na Cloudflare nesta sprint (ver relatório Sprint 01B). Este
-- arquivo existe só como config/schema local, pronto para aplicação quando o
-- provisionamento remoto for autorizado.

CREATE TABLE IF NOT EXISTS intelligence_sessions (
  id TEXT PRIMARY KEY,                    -- UUID v4 opaco (crypto.randomUUID()), nunca derivável de identidade
  status TEXT NOT NULL CHECK (status IN ('created', 'ingesting', 'ready', 'failed')),
  created_at TEXT NOT NULL,               -- ISO 8601 UTC
  expires_at TEXT NOT NULL,               -- ISO 8601 UTC — TTL, ver shared/intelligence/constants.ts
  page_count INTEGER,                     -- preenchido só após ingestão bem-sucedida
  chunk_count INTEGER,                    -- preenchido só após chunking bem-sucedido
  strategy_version TEXT                   -- versão do algoritmo de chunking usado, quando ready
);

CREATE INDEX IF NOT EXISTS idx_intelligence_sessions_expires_at
  ON intelligence_sessions (expires_at);

CREATE TABLE IF NOT EXISTS intelligence_chunks (
  id TEXT PRIMARY KEY,                    -- "<sessionId>:<chunkIndex>"
  session_id TEXT NOT NULL REFERENCES intelligence_sessions(id),
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_page INTEGER NOT NULL,
  end_page INTEGER NOT NULL,
  pages_json TEXT NOT NULL,               -- JSON array de páginas contribuintes, ex.: "[3,4]"
  strategy_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intelligence_chunks_session
  ON intelligence_chunks (session_id, chunk_index);

-- Débito técnico registrado deliberadamente (não resolvido nesta sprint):
-- sessões e chunks expirados/falhos não são fisicamente apagados por nenhum
-- processo automático aqui (nenhum Cron de limpeza nesta sprint, conforme
-- escopo). A leitura (`claimSessionForIngest`, `getSession` + checagem de
-- `expires_at`) já trata sessão expirada como inutilizável, mas o espaço em
-- disco não é recuperado até uma limpeza física futura.
