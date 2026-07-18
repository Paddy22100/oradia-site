-- Migration : séquence email post-tirage en 3 temps (J0 résultat, J+3 check-in,
-- J+7 offre abonnement). J0 existe déjà (collect-email), J+7 existe déjà
-- (promo_sent_at, dont le délai passe de 24h à 7 jours dans le code) — cette
-- migration ajoute uniquement le suivi du nouveau mail J+3.

ALTER TABLE tore_emails
  ADD COLUMN IF NOT EXISTS checkin_sent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN tore_emails.checkin_sent_at IS
  'Date d''envoi du mail de check-in J+3 ("avez-vous observé une synchronicité ?").';
