-- Migration : ajout colonnes is_free et plan dans tore_subscriptions
-- À exécuter dans Supabase > SQL Editor
--
-- is_free : marque un abonnement comme gratuit (offert manuellement),
--           pour l'exclure des recettes en comptabilité.
-- plan    : niveau d'abonnement ('decouverte' → 5€/mois, 'complet' → 8€/mois)

ALTER TABLE public.tore_subscriptions
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tore_subscriptions
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'complet';

-- Marquer les comptes de fonctionnement comme gratuits
UPDATE public.tore_subscriptions
SET is_free = true
WHERE email IN ('audit@oradia.fr', 'contact@oradia.fr');

-- Vérification
SELECT email, full_name, plan, is_free, status
FROM public.tore_subscriptions
ORDER BY created_at;
