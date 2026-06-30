-- Date et lieu de naissance des abonnés Tore, collectés en option dans leur
-- profil (member/profile.html) pour de futures analyses personnalisées
-- (astrologie, etc.) — aucun envoi automatique n'est branché pour l'instant.
ALTER TABLE public.tore_subscriptions
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS birth_place TEXT;
