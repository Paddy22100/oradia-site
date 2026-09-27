-- ============================================================
-- MIGRATION : webhook Stripe fiable + remboursements (table preorders)
-- ============================================================
-- 1. paid_status accepte 'refunded'.
--    L'action admin de remboursement groupé (bulk-refund-preorders, voir
--    supabase-migration-preorders-refund.sql) écrit paid_status = 'refunded', mais
--    les deux contraintes CHECK en production (preorders_paid_status_check et son
--    doublon preorders_status_check) n'autorisaient que pending/completed/failed :
--    le remboursement Stripe partait, puis la mise à jour du statut échouait — la
--    commande restait "Payée" et l'email de remboursement n'était jamais envoyé.
--
-- 2. checkout_expired_at : posé par api/stripe-webhook.js sur l'événement
--    checkout.session.expired (session de paiement abandonnée). paid_status reste
--    'pending' pour que la relance panier abandonné (cron-relance) continue de
--    fonctionner.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

ALTER TABLE preorders DROP CONSTRAINT IF EXISTS preorders_status_check;
ALTER TABLE preorders DROP CONSTRAINT IF EXISTS preorders_paid_status_check;
ALTER TABLE preorders ADD CONSTRAINT preorders_paid_status_check
    CHECK (paid_status = ANY (ARRAY['pending', 'completed', 'failed', 'refunded']));

ALTER TABLE preorders ADD COLUMN IF NOT EXISTS checkout_expired_at TIMESTAMPTZ;

COMMENT ON COLUMN preorders.checkout_expired_at IS
    'Date d''expiration de la session Stripe Checkout (panier abandonné). paid_status reste pending.';
