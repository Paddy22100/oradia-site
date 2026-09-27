-- ============================================================
-- MIGRATION : adresse de facturation des précommandes
-- ============================================================
-- Remplie par api/create-checkout-session.js quand le client coche « adresse de
-- facturation différente » sur livraison.html (auparavant saisie puis ignorée).
-- Vide = facturation à l'adresse de livraison. Affichée dans la fiche
-- précommande du dashboard admin.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

ALTER TABLE preorders
    ADD COLUMN IF NOT EXISTS billing_address            TEXT,
    ADD COLUMN IF NOT EXISTS billing_address_complement TEXT,
    ADD COLUMN IF NOT EXISTS billing_postal_code        TEXT,
    ADD COLUMN IF NOT EXISTS billing_city               TEXT,
    ADD COLUMN IF NOT EXISTS billing_country            TEXT;
