-- Migration : distinguer "promo envoyée" de "promo volontairement non envoyée"
-- (import d'historique). Sans cette colonne, l'import marquait promo_sent_at
-- pour éviter un envoi rétroactif, mais le dashboard affichait alors
-- "Envoyée le X" à tort — aucun email n'était réellement parti.

ALTER TABLE tore_emails
  ADD COLUMN IF NOT EXISTS promo_skipped BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tore_emails.promo_skipped IS
  'true = email issu d''un import d''historique, promo volontairement non envoyée (pas de relance rétroactive). Distinct de promo_sent_at qui signifie un envoi réel.';

-- Corrige les lignes déjà importées par erreur avant cette migration
-- (promo_sent_at posé au lieu de promo_skipped, donc affichées à tort
-- comme "Envoyée le ..." dans le dashboard alors que rien n'est parti).
-- Repère : le cron réel envoie la promo ~24h après created_at ; un écart
-- de plus de 48h entre created_at et promo_sent_at trahit un import,
-- pas un envoi réel. Vérifie le résultat du SELECT avant de lancer l'UPDATE.

-- 1. Vérification (à exécuter d'abord) :
-- SELECT email, created_at, promo_sent_at
-- FROM tore_emails
-- WHERE promo_sent_at IS NOT NULL
--   AND promo_sent_at - created_at > INTERVAL '48 hours';

-- 2. Correction (une fois la liste ci-dessus validée) :
-- UPDATE tore_emails
--   SET promo_skipped = true, promo_sent_at = NULL
--   WHERE promo_sent_at IS NOT NULL
--     AND promo_sent_at - created_at > INTERVAL '48 hours';
