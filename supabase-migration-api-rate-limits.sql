-- ============================================================
-- MIGRATION : limitation de débit persistante des API publiques
-- ============================================================
-- Utilisée par lib/rate-limit.js (api/analyse-tirage.js) : une ligne par appel
-- autorisé, comptée sur une fenêtre glissante. Remplace le compteur en mémoire,
-- inopérant sur Vercel (mémoire propre à chaque instance serverless).
-- Purge automatique des lignes de plus de 2 jours par lib/rate-limit.js.
--
-- Tant que cette migration n'est pas exécutée, la limitation est désactivée
-- (fail-open) : le site continue de fonctionner normalement.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
    id         BIGSERIAL PRIMARY KEY,
    bucket     TEXT NOT NULL,          -- ex: 'analyse-ip', 'analyse-global'
    key        TEXT NOT NULL,          -- ex: adresse IP, 'all'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_bucket_key_created
    ON api_rate_limits (bucket, key, created_at DESC);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Accès réservé aux fonctions serverless (service_role) : aucune policy anon/authenticated.
DROP POLICY IF EXISTS "api_rate_limits_service_role" ON api_rate_limits;
CREATE POLICY "api_rate_limits_service_role" ON api_rate_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE api_rate_limits IS
    'Appels récents aux API publiques coûteuses (analyse IA), pour la limitation de débit persistante — voir lib/rate-limit.js. Lignes purgées après 2 jours.';
