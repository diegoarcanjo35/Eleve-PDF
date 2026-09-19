-- Migration 0003 (Inteligência Documental) — Fase 01, Sprint 01C.1.
--
-- Adiciona `ready_at` a intelligence_sessions: timestamp de quando a sessão
-- realmente transicionou para `ready` (upsert no Vectorize aceito). Usado
-- pelo endpoint de retrieval para decidir se um resultado vazio do Vectorize
-- deve ser tratado como "sem conteúdo relevante" ou "possivelmente ainda em
-- propagação assíncrona" (ver shared/intelligence/constants.ts,
-- VECTORIZE_PROPAGATION_GRACE_MS, e functions/api/.../retrieve.ts).
--
-- Diferente das migrations 0001/0002, esta NÃO precisa recriar a tabela —
-- adicionar uma coluna simples (sem CHECK constraint) é suportado
-- diretamente por SQLite/D1 via ALTER TABLE ADD COLUMN.

ALTER TABLE intelligence_sessions ADD COLUMN ready_at TEXT;
