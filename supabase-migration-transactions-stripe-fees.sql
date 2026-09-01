-- Ajoute le frais Stripe réel par transaction (pas juste le total mensuel déjà
-- disponible via l'API Stripe — voir lib/stripe-fees.js getMonthlyStripeFees).
-- Rempli par l'import CSV "Paiements" Stripe depuis le dashboard admin
-- (api/admin/index.js, action=stripe-payments-import).

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS fee_amount NUMERIC,
ADD COLUMN IF NOT EXISTS net_amount NUMERIC,
ADD COLUMN IF NOT EXISTS fee_imported_at TIMESTAMPTZ;

-- Rattachement direct pour le tout premier paiement d'un abonnement (Checkout Session) :
-- aucune table ne garde le lien session Stripe <-> PaymentIntent pour les abonnements
-- (contrairement à preorders/donors, qui ont les deux), donc le rattachement habituel
-- payment_intent_id -> ...session_id -> transactions.source_ref est impossible pour cette
-- ligne précise. On stocke ici directement le PaymentIntent connu au moment de l'insertion
-- (api/stripe-webhook.js, activateToreSubscription) pour permettre un rattachement direct.
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;
