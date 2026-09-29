-- Langue des emails de relance après un tirage gratuit ('fr' | 'en') : check-in J+3 et
-- offre d'abonnement J+7 (api/tirages/send-email.js). Renseignée à la collecte de l'email
-- (action collect-email, lang: 'en' depuis /en/tore-analysis.html). Existants : français.
ALTER TABLE public.tore_emails
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'fr';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tore_emails_lang_check') THEN
    ALTER TABLE public.tore_emails
      ADD CONSTRAINT tore_emails_lang_check CHECK (lang IN ('fr', 'en'));
  END IF;
END $$;
