-- ============================================================
-- Migration : rate limiting abonnés Tore (tirages mensuels)
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- 1. Ajouter les colonnes de comptage mensuel sur tore_subscriptions
ALTER TABLE tore_subscriptions
  ADD COLUMN IF NOT EXISTS monthly_draws_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_draws_reset_at DATE    NOT NULL DEFAULT CURRENT_DATE;

-- 2. Commentaires explicatifs
COMMENT ON COLUMN tore_subscriptions.monthly_draws_count
  IS 'Nombre de tirages effectués dans le mois calendaire en cours';
COMMENT ON COLUMN tore_subscriptions.monthly_draws_reset_at
  IS 'Date du début du mois pour lequel monthly_draws_count est valide (YYYY-MM-01)';

-- 3. Index pour accélerer la vérification par email + statut
CREATE INDEX IF NOT EXISTS idx_tore_subs_email_status
  ON tore_subscriptions (email, status);

-- 4. Fonction de reset mensuel (exécutable via cron ou manuellement)
--    Remet tous les compteurs à 0 et met à jour la date de reset au 1er du mois courant
CREATE OR REPLACE FUNCTION reset_monthly_draw_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tore_subscriptions
  SET
    monthly_draws_count    = 0,
    monthly_draws_reset_at = DATE_TRUNC('month', CURRENT_DATE)::date
  WHERE
    status = 'active'
    AND monthly_draws_reset_at < DATE_TRUNC('month', CURRENT_DATE)::date;

  RAISE NOTICE '[rate-limiting] Compteurs mensuels réinitialisés — %', NOW();
END;
$$;

-- 5. Vue de monitoring pour le dashboard admin
CREATE OR REPLACE VIEW tore_draw_stats AS
SELECT
  email,
  status,
  monthly_draws_count,
  monthly_draws_reset_at,
  CASE
    WHEN monthly_draws_count >= 300 THEN 'limit_reached'
    WHEN monthly_draws_count >= 200 THEN 'high_usage'
    WHEN monthly_draws_count >= 100 THEN 'moderate_usage'
    ELSE 'normal'
  END AS usage_tier,
  300 - monthly_draws_count AS draws_remaining
FROM tore_subscriptions
WHERE status = 'active'
ORDER BY monthly_draws_count DESC;

-- RLS : vue accessible uniquement via service_role
ALTER VIEW tore_draw_stats SET (security_invoker = false);
