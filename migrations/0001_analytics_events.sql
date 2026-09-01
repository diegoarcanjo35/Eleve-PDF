-- Migration 0001: tabela de eventos analíticos do ElevePDF (first-party, pseudônimo).
--
-- Campos tipados e fechados só — nenhuma coluna genérica de texto livre que
-- permitiria armazenar qualquer coisa (ex.: nome de arquivo, conteúdo de PDF).
-- `session_id` é um UUID pseudônimo por aba (ver shared/analytics/), nunca
-- associado a nome, e-mail, IP bruto ou fingerprint.
--
-- Índices criados apenas para as consultas do painel descritas no relatório
-- (ver "Índices" no final deste arquivo) — nenhum índice especulativo.

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,              -- ISO 8601 UTC, ex.: 2026-09-02T14:30:00.000Z
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  session_id TEXT NOT NULL,               -- UUID v4 pseudônimo, gerado no cliente (crypto.randomUUID())
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
    'home', 'compactar-pdf', 'dividir-pdf-por-tamanho', 'privacidade'
  )),
  tool_id TEXT CHECK (tool_id IS NULL OR tool_id IN (
    'compactar-pdf', 'dividir-pdf-por-tamanho'
  )),
  cta_id TEXT CHECK (cta_id IS NULL OR cta_id IN (
    'hero_compactar', 'hero_dividir', 'card_compactar', 'card_dividir',
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
  referrer_host TEXT,       -- só hostname, nunca a URL completa (ver shared/analytics/sanitize.ts)
  landing_page TEXT CHECK (landing_page IS NULL OR landing_page IN (
    'home', 'compactar-pdf', 'dividir-pdf-por-tamanho', 'privacidade'
  ))
);

-- Consultas do painel previstas (ver RELATORIO-FASE-E-ANALYTICS.md):
--   1. Contagem de sessões distintas por dia/período           -> filtra por occurred_at, agrupa por session_id
--   2. Uso por ferramenta (tool_open, processing_success, ...)  -> filtra por event_type (+ tool_id) e período
--   3. Erros por categoria                                       -> filtra por event_type='processing_error' e error_category
--   4. Origem por UTM / referrer_host                            -> agrupa por utm_source / referrer_host
-- Todas essas consultas filtram primeiro por `occurred_at` (janela de tempo) e
-- depois por `event_type` — por isso o índice composto abaixo, na ordem que o
-- SQLite/D1 pode efetivamente usar (prefixo occurred_at, depois event_type).
CREATE INDEX IF NOT EXISTS idx_analytics_events_time_type
  ON analytics_events (occurred_at, event_type);

-- Suporta a contagem de sessões distintas (`SELECT COUNT(DISTINCT session_id) ...`)
-- dentro de uma janela de tempo sem varrer a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON analytics_events (session_id, occurred_at);
