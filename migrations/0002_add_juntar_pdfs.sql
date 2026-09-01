-- Migration 0002: adiciona "juntar-pdfs" ao vocabulário fechado do Analytics
-- (route_id, tool_id, cta_id, landing_page).
--
-- A migration 0001 já foi aplicada em produção e não pode mais ser editada —
-- SQLite/D1 não suportam ALTER TABLE para adicionar/remover valores de uma
-- constraint CHECK existente. O único jeito seguro é recriar a tabela com as
-- constraints atualizadas, preservando todas as linhas existentes.
--
-- Passos: cria a tabela nova (mesmas colunas e índices, CHECKs atualizados)
-- -> copia todos os dados da tabela antiga -> derruba a antiga -> renomeia a
-- nova para o nome original -> recria os dois índices (perdidos ao apagar a
-- tabela antiga). Nenhuma linha é perdida ou alterada; nenhum evento é
-- inserido por esta migration.

CREATE TABLE analytics_events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'page_view',
    'tool_open',
    'file_validation_success',
    'file_validation_error',
    'processing_start',
    'processing_success',
    'processing_error',
    'download_result',
    'structural_warning_shown',
    'structural_warning_confirmed',
    'no_gain_original_returned',
    'oversized_parts_result'
  )),
  route_id TEXT CHECK (route_id IS NULL OR route_id IN (
    'home', 'compactar-pdf', 'dividir-pdf-por-tamanho', 'juntar-pdfs', 'privacidade', 'termos-de-uso'
  )),
  tool_id TEXT CHECK (tool_id IS NULL OR tool_id IN (
    'compactar-pdf', 'dividir-pdf-por-tamanho', 'juntar-pdfs'
  )),
  cta_id TEXT CHECK (cta_id IS NULL OR cta_id IN (
    'hero_compactar', 'hero_dividir', 'card_compactar', 'card_dividir', 'card_juntar',
    'cross_link_compactar', 'cross_link_dividir'
  )),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN (
    'success', 'error', 'cancelled', 'no_gain'
  )),
  error_category TEXT CHECK (error_category IS NULL OR error_category IN (
    'not-a-pdf', 'corrupted', 'password-protected', 'too-large', 'too-many-pages',
    'out-of-memory', 'processing-failed', 'page-exceeds-limit', 'unknown'
  )),
  compression_level TEXT CHECK (compression_level IS NULL OR compression_level IN (
    'leve', 'equilibrada', 'maxima'
  )),
  parts_bucket TEXT CHECK (parts_bucket IS NULL OR parts_bucket IN (
    '1', '2-5', '6-20', '21+'
  )),
  oversized_parts_bucket TEXT CHECK (oversized_parts_bucket IS NULL OR oversized_parts_bucket IN (
    '0', '1', '2-5', '6+'
  )),
  duration_bucket TEXT CHECK (duration_bucket IS NULL OR duration_bucket IN (
    '<1s', '1-3s', '3-10s', '10-30s', '30s+'
  )),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer_host TEXT,
  landing_page TEXT CHECK (landing_page IS NULL OR landing_page IN (
    'home', 'compactar-pdf', 'dividir-pdf-por-tamanho', 'juntar-pdfs', 'privacidade', 'termos-de-uso'
  ))
);

INSERT INTO analytics_events_new
  SELECT * FROM analytics_events;

DROP TABLE analytics_events;

ALTER TABLE analytics_events_new RENAME TO analytics_events;

CREATE INDEX IF NOT EXISTS idx_analytics_events_time_type
  ON analytics_events (occurred_at, event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON analytics_events (session_id, occurred_at);
