-- Résiliation depuis l'espace membre : reflet de Stripe cancel_at_period_end
-- (mis à jour par /api/auth/update-auto-renew, le webhook customer.subscription.updated
-- et la réconciliation quotidienne).
ALTER TABLE public.tore_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- Suppression du « 1 mois de Tore offert avec la commande » (code promo par commande),
-- remplacé par le QR code commun du livret (/oracle-offert, lib/oracle-trial.js).
DELETE FROM public.feature_flags WHERE key = 'oracle_tore_gift';
ALTER TABLE public.preorders DROP COLUMN IF EXISTS tore_gift_code;
