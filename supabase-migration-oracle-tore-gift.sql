-- ============================================================
-- MIGRATION : « 1 mois de Tore offert » avec l'oracle physique
-- ============================================================
-- Interrupteur oracle_tore_gift (catégorie Boutique) — DÉSACTIVÉ par défaut, voir
-- lib/tore-gift.js (loi Lang : prime à proposer à tous les vendeurs).
-- preorders.tore_gift_code : code promotion Stripe unique créé par le webhook et
-- envoyé dans l'email de confirmation (créé une seule fois par commande).
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

INSERT INTO feature_flags (key, label, description, category, enabled) VALUES
    ('oracle_tore_gift', '1 mois de Tore offert avec l''oracle',
     'Chaque commande de l''oracle reçoit un code unique « 1 mois d''abonnement Tore offert » dans l''email de confirmation. Avec un ISBN (loi Lang), n''activer que si le même avantage est proposé dans les coffrets vendus en boutique.',
     'boutique', FALSE)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE preorders ADD COLUMN IF NOT EXISTS tore_gift_code TEXT;
