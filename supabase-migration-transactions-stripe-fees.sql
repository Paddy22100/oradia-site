-- Ajoute le frais Stripe réel par transaction (pas juste le total mensuel déjà
-- disponible via l'API Stripe — voir lib/stripe-fees.js getMonthlyStripeFees).
-- Rempli par l'import CSV "Paiements" Stripe depuis le dashboard admin
-- (api/admin/index.js, action=stripe-payments-import).

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS fee_amount NUMERIC,
ADD COLUMN IF NOT EXISTS net_amount NUMERIC,
ADD COLUMN IF NOT EXISTS fee_imported_at TIMESTAMPTZ;
