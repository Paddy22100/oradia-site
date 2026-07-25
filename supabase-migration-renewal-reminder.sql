-- Rappel de renouvellement d'abonnement Tore
-- Ajoute une colonne pour mémoriser l'échéance pour laquelle un rappel a déjà été
-- envoyé, afin de n'envoyer qu'un seul rappel par cycle de facturation.
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE tore_subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminder_for timestamptz;

COMMENT ON COLUMN tore_subscriptions.renewal_reminder_for IS
  'Date d''échéance (expires_at) pour laquelle un mail de rappel de renouvellement a déjà été envoyé. Empêche les doublons de rappel dans un même cycle.';
