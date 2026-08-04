-- Frais Stripe réels, mois par mois
-- Remplace l'estimation par taux forfaitaire (1,4 % / 1,5 % + 0,25 €) utilisée dans le
-- rapport mensuel et le dashboard. Le taux réel dépend de la carte du client et Stripe
-- prélève aussi des frais hors encaissement (Billing, Radar, litiges, change) : seule la
-- lecture des balance transactions donne le montant exact.
-- Cette table sert de cache et de trace auditable — un mois clos ne change plus.
-- À exécuter dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS stripe_monthly_fees (
  month               date PRIMARY KEY,
  fees_eur            numeric(10,2) NOT NULL DEFAULT 0,
  processing_fees_eur numeric(10,2) NOT NULL DEFAULT 0,
  other_fees_eur      numeric(10,2) NOT NULL DEFAULT 0,
  gross_eur           numeric(10,2) NOT NULL DEFAULT 0,
  net_eur             numeric(10,2) NOT NULL DEFAULT 0,
  charge_count        integer NOT NULL DEFAULT 0,
  refund_count        integer NOT NULL DEFAULT 0,
  fetched_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE stripe_monthly_fees IS
  'Frais Stripe réellement prélevés par mois, lus depuis les balance transactions. Cache alimenté par lib/stripe-fees.js.';
COMMENT ON COLUMN stripe_monthly_fees.month IS
  'Premier jour du mois concerné (ex. 2026-07-01 pour juillet 2026).';
COMMENT ON COLUMN stripe_monthly_fees.fees_eur IS
  'Total des frais Stripe du mois = processing_fees_eur + other_fees_eur.';
COMMENT ON COLUMN stripe_monthly_fees.processing_fees_eur IS
  'Commissions prélevées sur les encaissements (part variable selon la carte + part fixe).';
COMMENT ON COLUMN stripe_monthly_fees.other_fees_eur IS
  'Frais Stripe hors encaissement : Billing, Radar, litiges, frais de change.';
COMMENT ON COLUMN stripe_monthly_fees.gross_eur IS
  'Montant brut passé sur le compte Stripe ce mois (encaissements moins remboursements).';
COMMENT ON COLUMN stripe_monthly_fees.net_eur IS
  'Montant net effectivement crédité après tous les frais Stripe.';

-- Table strictement interne : aucun accès depuis le front, uniquement service_role.
ALTER TABLE stripe_monthly_fees ENABLE ROW LEVEL SECURITY;
