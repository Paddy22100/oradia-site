-- ============================================================
-- MIGRATION : Boutique — précommande / vente ferme
-- ============================================================
-- 1. Interrupteurs du dashboard (Paramètres > Fonctionnalités > Boutique), lus par
--    lib/shop-mode.js. État initial = état historique du site : précommandes
--    ouvertes, vente ferme fermée.
-- 2. preorders.order_type : 'preorder' (précommande) ou 'order' (vente ferme). Même
--    table pour les deux — dashboard, Mondial Relay, expédition et comptabilité
--    fonctionnent à l'identique ; la cagnotte de fabrication ne compte que les
--    précommandes.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

INSERT INTO feature_flags (key, label, description, category, enabled) VALUES
    ('shop_preorder_enabled', 'Précommandes ouvertes',
     'Page /precommande, panier et paiement des précommandes. Désactivé : la page redirige vers /commander si la vente en ligne est ouverte, sinon affiche « bientôt disponible ».',
     'boutique', TRUE),
    ('shop_order_enabled', 'Commandes en ligne ouvertes',
     'Page /commander : vente ferme de l''oracle en stock (prix de sortie, expédition rapide). À activer à la réception du stock.',
     'boutique', FALSE)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE preorders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'preorder';
ALTER TABLE preorders DROP CONSTRAINT IF EXISTS preorders_order_type_check;
ALTER TABLE preorders ADD CONSTRAINT preorders_order_type_check CHECK (order_type IN ('preorder', 'order'));
CREATE INDEX IF NOT EXISTS idx_preorders_order_type ON preorders (order_type);
