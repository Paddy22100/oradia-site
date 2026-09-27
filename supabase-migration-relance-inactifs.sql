-- Migration : suivi de la relance douce des abonnés Tore inactifs 30j
-- À exécuter dans Supabase > SQL Editor.
--
-- last_relance_sent_at : horodatage du seul envoi de cette relance à cet
-- abonné (envoyée une fois maximum tant que le statut reste inactif, voir
-- api/tirages/send-email.js?action=cron-relance-inactifs — jamais de rappel
-- récurrent, pour ne pas culpabiliser). Repasse à NULL uniquement si le
-- compte redevient inactif après une reprise (non automatisé, geste admin).

ALTER TABLE tore_subscriptions
  ADD COLUMN IF NOT EXISTS last_relance_sent_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_tore_subscriptions_relance
  ON tore_subscriptions(last_relance_sent_at)
  WHERE last_relance_sent_at IS NULL;
