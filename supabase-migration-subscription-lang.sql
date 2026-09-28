-- Langue de l'abonné Tore ('fr' | 'en') : langue des emails qui lui sont envoyés
-- (bienvenue, réparation d'accès, échec de paiement, fin d'abonnement, relance
-- « pas encore de tirage »). Renseignée par api/stripe-webhook.js à l'activation, d'après
-- les métadonnées Stripe (lang: 'en' pour un abonnement souscrit depuis /en/tore.html).
-- Les abonnés existants restent en français (valeur par défaut).
ALTER TABLE public.tore_subscriptions
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'fr';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tore_subscriptions_lang_check'
  ) THEN
    ALTER TABLE public.tore_subscriptions
      ADD CONSTRAINT tore_subscriptions_lang_check CHECK (lang IN ('fr', 'en'));
  END IF;
END $$;
