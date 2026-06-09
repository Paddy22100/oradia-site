-- ============================================================
-- MIGRATION : support_messages — Centralisation du support admin
-- ============================================================
-- Les messages de support / témoignages / suggestions étaient uniquement
-- envoyés par email (api/support.js → Brevo → contact@oradia.fr).
-- Cette migration crée la table pour les centraliser dans le dashboard admin.
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS support_messages (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type        TEXT NOT NULL CHECK (type IN ('support', 'temoignage', 'suggestion')),
    email       TEXT NOT NULL,
    name        TEXT,

    -- Champs contextuels selon le type
    sujet       TEXT,        -- support uniquement
    categorie   TEXT,        -- suggestion uniquement
    publication TEXT,        -- temoignage : 'anonyme' | 'prenom' | 'non'

    message     TEXT NOT NULL,

    -- Gestion admin
    status      TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived', 'replied')),
    admin_note  TEXT,
    read_at     TIMESTAMP WITH TIME ZONE,

    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_type      ON support_messages(type);
CREATE INDEX IF NOT EXISTS idx_support_messages_status    ON support_messages(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_email     ON support_messages(email);
CREATE INDEX IF NOT EXISTS idx_support_messages_created   ON support_messages(created_at DESC);

-- RLS : accès service_role uniquement (données personnelles)
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_messages_service_role" ON support_messages;
CREATE POLICY "support_messages_service_role" ON support_messages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE support_messages IS
    'Messages de support, témoignages et suggestions reçus depuis l''espace membre. '
    'Miroir de l''email Brevo → contact@oradia.fr, consultable depuis le dashboard admin.';

-- ============================================================
-- NOTE : single_draw_credits dans tore_subscriptions
-- ============================================================
-- La colonne single_draw_credits existe déjà en production (ajoutée par le webhook).
-- Si elle est absente (nouvelle instance), l'ajouter avec :
--
-- ALTER TABLE tore_subscriptions
--   ADD COLUMN IF NOT EXISTS single_draw_credits INTEGER DEFAULT 0;
-- ============================================================
