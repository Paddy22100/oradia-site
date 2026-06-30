-- Permet de programmer l'envoi d'un brouillon newsletter à une date/heure précise.
ALTER TABLE public.newsletter_drafts
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
