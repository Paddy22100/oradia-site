-- Migration : traçage de la dernière newsletter reçue par contact
-- Permet d'afficher dans le dashboard (Contacts > Inscrits Newsletter)
-- si chaque personne a reçu la dernière newsletter, avec date et sujet.
-- À exécuter dans le SQL Editor de Supabase.

ALTER TABLE newsletter_contacts
  ADD COLUMN IF NOT EXISTS last_newsletter_sent_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_newsletter_subject TEXT DEFAULT NULL;

COMMENT ON COLUMN newsletter_contacts.last_newsletter_sent_at IS
  'Date du dernier envoi de newsletter à ce contact (boucle directe : envoi confirmé ; campagne Brevo liste 5 : contact présent dans la liste au moment de l''envoi)';
