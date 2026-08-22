-- Ajoute le suivi des remboursements Stripe sur la table preorders.
-- Utilisé par l'action admin "bulk-refund-preorders" (api/admin/index.js).
--
-- paid_status passe à 'refunded' au moment du remboursement : cela l'exclut
-- automatiquement de tous les calculs existants qui filtrent sur
-- paid_status = 'completed' (barre de progression /api/preorders/progress,
-- totaux du dashboard admin, accès tirages...), sans avoir à toucher ce code.

ALTER TABLE preorders
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS refund_id TEXT,
ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER,
ADD COLUMN IF NOT EXISTS refund_email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_preorders_refunded_at ON preorders(refunded_at);
