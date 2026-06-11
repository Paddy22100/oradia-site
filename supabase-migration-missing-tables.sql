-- ============================================================
-- MIGRATION : Tables manquantes — newsletter_contacts + tore_subscriptions
-- ============================================================
-- Ces deux tables sont référencées partout dans le code (api/waitlist.js,
-- api/admin/index.js) mais n'avaient pas de fichier de migration.
-- À exécuter dans Supabase > SQL Editor.
--
-- État post-migration attendu :
--   newsletter_contacts  → inscriptions newsletter / waitlist (via /api/waitlist)
--   tore_subscriptions   → membres actifs avec accès aux tirages (via /api/waitlist?action=signup)
-- ============================================================

-- ============================================================
-- 1. newsletter_contacts
-- ============================================================
-- Stocke les inscrits à la newsletter / liste d'attente.
-- Source principale : precommande-oracle.html → POST /api/waitlist
-- Admin : section "waitlist" du dashboard, export CSV, sync Brevo (list 5)
-- ============================================================

CREATE TABLE IF NOT EXISTS newsletter_contacts (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    source      TEXT DEFAULT 'precommande-oracle',
    status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
    metadata    JSONB DEFAULT '{}',

    -- Synchronisation Brevo (list ID 5)
    brevo_synced    BOOLEAN DEFAULT FALSE,
    brevo_synced_at TIMESTAMP WITH TIME ZONE,

    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_contacts_email      ON newsletter_contacts(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_contacts_status     ON newsletter_contacts(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_contacts_brevo      ON newsletter_contacts(brevo_synced);
CREATE INDEX IF NOT EXISTS idx_newsletter_contacts_created_at ON newsletter_contacts(created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_newsletter_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS newsletter_contacts_updated_at ON newsletter_contacts;
CREATE TRIGGER newsletter_contacts_updated_at
    BEFORE UPDATE ON newsletter_contacts
    FOR EACH ROW EXECUTE FUNCTION update_newsletter_contacts_updated_at();

-- RLS
ALTER TABLE newsletter_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_contacts_service_role" ON newsletter_contacts;
CREATE POLICY "newsletter_contacts_service_role" ON newsletter_contacts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE newsletter_contacts IS
    'Inscriptions newsletter / waitlist Oradia. '
    'Synchronisée vers Brevo list ID 5 via /api/admin/sync-brevo. '
    'La colonne brevo_synced doit être false pour les contacts non encore envoyés vers Brevo.';


-- ============================================================
-- 2. tore_subscriptions
-- ============================================================
-- Membres avec accès actif aux tirages Tore en ligne.
-- Créés lors du signup (/api/waitlist?action=signup) ou manuellement
-- depuis le dashboard admin (/api/admin/subscriptions).
-- ============================================================

CREATE TABLE IF NOT EXISTS tore_subscriptions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT,
    birthdate   DATE,

    -- Statut d'accès
    status      TEXT DEFAULT 'active',
    -- Valeurs connues : 'active', 'revoked', 'payment_failed', 'cancelled', 'pending'
    -- Pas de CHECK constraint pour permettre de nouveaux statuts sans migration

    -- Stripe (optionnel, renseigné si paiement récurrent)
    stripe_customer_id     TEXT,
    stripe_subscription_id TEXT,

    -- Code d'accès admin-only (généré par l'admin pour accès manuel)
    access_code TEXT UNIQUE,
    expires_at  TIMESTAMP WITH TIME ZONE,

    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tore_subscriptions_email  ON tore_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_tore_subscriptions_status ON tore_subscriptions(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_tore_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tore_subscriptions_updated_at ON tore_subscriptions;
CREATE TRIGGER tore_subscriptions_updated_at
    BEFORE UPDATE ON tore_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_tore_subscriptions_updated_at();

-- RLS
ALTER TABLE tore_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tore_subscriptions_service_role" ON tore_subscriptions;
CREATE POLICY "tore_subscriptions_service_role" ON tore_subscriptions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE tore_subscriptions IS
    'Membres actifs pour les tirages Tore en ligne. '
    'Créés via /api/waitlist (action=signup) ou depuis le dashboard admin. '
    'Le champ status doit être ''active'' pour autoriser l''accès aux tirages. '
    'Pas de CHECK constraint sur status pour permettre l''ajout de nouveaux états sans migration.';


-- ============================================================
-- TABLES ORPHELINES — à nettoyer manuellement si elles existent
-- ============================================================
-- Les tables suivantes ont une migration SQL mais ne sont plus utilisées dans le code.
-- À supprimer dans Supabase après vérification qu'elles sont bien vides en production :
--
--   waitlist_tirages     → Ancien nom de newsletter_contacts (migration waitlist-tirages-clean.sql)
--                          Jamais référencée dans aucun fichier .js ou .html.
--                          Peut être supprimée après vérification : SELECT COUNT(*) FROM waitlist_tirages;
--
--   precommande_subscribers → Ancien schéma initial (supabase-schema.sql)
--                             Remplacée par preorders + newsletter_contacts.
--                             Peut être supprimée après vérification : SELECT COUNT(*) FROM precommande_subscribers;
--
--   analytics_events    → Créée dans supabase-schema.sql, jamais utilisée dans le code.
--                          Peut être supprimée : SELECT COUNT(*) FROM analytics_events;
--
--   subscriptions       → Dans supabase-schema-complete.sql (table "abonnements Tore").
--                          Doublon de tore_subscriptions. À vérifier si vide :
--                          SELECT COUNT(*) FROM subscriptions;
--
--   credits             → Dans supabase-schema-complete.sql ("crédits Traversée").
--                          Concept abandonné — le modèle Tore est basé sur abonnement.
--                          À vérifier si vide : SELECT COUNT(*) FROM credits;
--
-- COMMANDES DE NETTOYAGE (à exécuter UNIQUEMENT après vérification que les tables sont vides) :
-- DROP TABLE IF EXISTS waitlist_tirages;
-- DROP TABLE IF EXISTS precommande_subscribers;
-- DROP TABLE IF EXISTS analytics_events;
-- DROP TABLE IF EXISTS subscriptions;
-- DROP TABLE IF EXISTS credits;
-- ============================================================
