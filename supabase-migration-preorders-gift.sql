-- ============================================================
-- MIGRATION : option cadeau des commandes de l'oracle
-- ============================================================
-- Case « C'est un cadeau » de livraison.html : colis sans prix, message glissé
-- dans le coffret (200 caractères max, voir lib/shop-config.js). Affiché dans la
-- fiche commande du dashboard et rappelé dans l'email de confirmation.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

ALTER TABLE preorders
    ADD COLUMN IF NOT EXISTS is_gift      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS gift_message TEXT;
