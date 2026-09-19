-- Migration 0002 (Inteligência Documental) — Fase 01, Sprint 01C.
--
-- Evolui a máquina de estados de `intelligence_sessions` para incluir
-- `indexing` entre `ingesting` e `ready` (uma sessão só chega a `ready`
-- depois de chunks *e* vetores/embeddings existirem, nunca antes — ver
-- functions/_shared/intelligenceDb.ts), e adiciona colunas para registrar o
-- resultado da indexação semântica.
--
-- A migration 0001 já foi aplicada em produção e preview (Sprint 01B.1) e
-- não é editada — SQLite/D1 não suportam ALTER TABLE para adicionar valores
-- a uma constraint CHECK existente. Mesma técnica já usada em
-- migrations/0002_add_juntar_pdfs.sql (Analytics): recria a tabela com as
-- constraints/colunas atualizadas, preservando todas as linhas existentes,
-- e recria o índice perdido ao apagar a tabela antiga.
--
-- Nenhuma linha é perdida ou alterada; nenhuma sessão/chunk é inserido por
-- esta migration. `intelligence_chunks` não muda (a ligação com o Vectorize
-- é só pelo `id` compartilhado, sem coluna nova necessária).

CREATE TABLE intelligence_sessions_new (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('created', 'ingesting', 'indexing', 'ready', 'failed')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  page_count INTEGER,
  chunk_count INTEGER,
  strategy_version TEXT,
  vector_count INTEGER,               -- preenchido só após indexação (embeddings + Vectorize) bem-sucedida
  embedding_strategy_version TEXT     -- versão lógica do modelo/config de embedding usada (ver constants.ts)
);

INSERT INTO intelligence_sessions_new (
  id, status, created_at, expires_at, page_count, chunk_count, strategy_version,
  vector_count, embedding_strategy_version
)
SELECT id, status, created_at, expires_at, page_count, chunk_count, strategy_version, NULL, NULL
FROM intelligence_sessions;

DROP TABLE intelligence_sessions;
ALTER TABLE intelligence_sessions_new RENAME TO intelligence_sessions;

CREATE INDEX IF NOT EXISTS idx_intelligence_sessions_expires_at
  ON intelligence_sessions (expires_at);
