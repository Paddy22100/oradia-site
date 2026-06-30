-- Permet de marquer un abonnement Tore comme gratuit (offert manuellement),
-- pour l'exclure des recettes en comptabilité.
ALTER TABLE public.tore_subscriptions
ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;
