-- ============================================================
-- MIGRATION : journal d'utilisation des API payantes (Claude, OpenAI)
-- ============================================================
-- Table écrite par lib/api-usage-tracker.js (logApiUsage) et lue par le dashboard
-- admin (coûts IA du mois). Son schéma n'existait qu'en commentaire dans ce
-- module : la table était absente en production (vérifié en septembre 2026),
-- donc chaque journalisation échouait silencieusement et le suivi des coûts IA
-- du dashboard restait vide.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_usage_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name            TEXT NOT NULL,
    model_name          TEXT NOT NULL,
    request_tokens      INTEGER,
    response_tokens     INTEGER,
    total_tokens        INTEGER,
    cost_usd            NUMERIC(10,6),
    cost_eur            NUMERIC(10,6),
    user_email          TEXT,
    ip_address          TEXT,
    status              TEXT,           -- 'success' | 'error' | 'fallback'
    error_message       TEXT,
    request_duration_ms INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created ON api_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_created ON api_usage_logs (api_name, created_at DESC);

ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_usage_logs_service_role" ON api_usage_logs;
CREATE POLICY "api_usage_logs_service_role" ON api_usage_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
