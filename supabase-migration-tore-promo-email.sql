-- Migration : ajouter promo_sent_at à tore_emails
-- Permet de tracer l'envoi automatique du mail promo abonnement Tore
-- et d'éviter les doublons.

ALTER TABLE tore_emails
  ADD COLUMN IF NOT EXISTS promo_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Créer la table si elle n'existait pas encore (sécurité)
CREATE TABLE IF NOT EXISTS tore_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  consent_marketing BOOLEAN DEFAULT FALSE,
  consent_date    TIMESTAMPTZ DEFAULT NULL,
  promo_sent_at   TIMESTAMPTZ DEFAULT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes admin (liste des emails sans promo envoyée)
CREATE INDEX IF NOT EXISTS idx_tore_emails_promo_sent ON tore_emails (promo_sent_at);
