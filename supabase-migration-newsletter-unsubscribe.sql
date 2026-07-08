-- Suivi des désinscriptions newsletter
-- Colonnes ajoutées pour tracker la date d'inscription et de désinscription de chaque contact
ALTER TABLE public.newsletter_contacts
  ADD COLUMN IF NOT EXISTS subscribed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Initialiser subscribed_at = created_at pour les contacts existants
UPDATE public.newsletter_contacts
SET subscribed_at = created_at
WHERE subscribed_at IS NULL;
