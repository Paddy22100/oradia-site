-- Suivi de l'envoi de l'email de lancement précommande, pour ne jamais
-- renvoyer deux fois le même email à un contact (bouton dashboard
-- "Communication" → case "ne pas renvoyer aux contacts déjà notifiés").
ALTER TABLE public.newsletter_contacts
ADD COLUMN IF NOT EXISTS precommande_launch_sent_at TIMESTAMPTZ;
