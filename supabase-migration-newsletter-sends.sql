-- Journal complet des envois de newsletter par contact.
--
-- newsletter_contacts.last_newsletter_sent_at/last_newsletter_subject (voir
-- supabase-migration-last-newsletter.sql) ne garde qu'un instantané : le DERNIER
-- envoi, écrasé à chaque nouveau. Impossible d'en déduire l'historique complet
-- d'un contact ni de retrouver de manière fiable son étape dans le parcours
-- (extra.ordre du brouillon) autrement qu'en rapprochant par sujet — fragile
-- dès que deux étapes partagent un sujet, ou qu'aucun sujet ne correspond.
--
-- Cette table journalise chaque envoi individuellement, remplie par
-- api/admin/index.js (logNewsletterSends, appelée à chaque point d'envoi réel :
-- campagne Brevo liste 5, campagne ciblée, envoi transactionnel, cron
-- newsletters programmées, renvoi de la dernière newsletter aux absents).

CREATE TABLE IF NOT EXISTS newsletter_sends (
  id BIGSERIAL PRIMARY KEY,
  contact_email TEXT NOT NULL,
  draft_id TEXT,
  subject TEXT,
  ordre INTEGER,
  canal TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_email   ON newsletter_sends(contact_email);
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_draft   ON newsletter_sends(draft_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_sent_at ON newsletter_sends(sent_at DESC);

ALTER TABLE newsletter_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_sends_service_role" ON newsletter_sends;
CREATE POLICY "newsletter_sends_service_role" ON newsletter_sends
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE newsletter_sends IS
  'Historique complet des envois de newsletter par contact — un envoi passé n''est jamais écrasé, contrairement à newsletter_contacts.last_newsletter_sent_at.';
COMMENT ON COLUMN newsletter_sends.draft_id IS
  'newsletter_drafts.id — pas de contrainte FK stricte (type de la clé non garanti), simple référence comme transactions.source_ref ailleurs dans le projet.';
COMMENT ON COLUMN newsletter_sends.ordre IS
  'extra.ordre du brouillon au moment de l''envoi, si étape du parcours — permet de situer précisément un contact sans rapprochement par sujet.';
