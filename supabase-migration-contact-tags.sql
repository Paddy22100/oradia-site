-- ============================================================
-- MIGRATION : Catégorisation des contacts newsletter (tags)
-- ============================================================
-- Permet de gérer depuis le dashboard admin des listes de
-- contacts par catégorie (thérapeutes, presse, prospects, etc.)
-- sans passer par l'interface Brevo.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

ALTER TABLE newsletter_contacts ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE newsletter_contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE newsletter_contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY['general']::TEXT[];

-- Les contacts déjà présents (inscriptions via le site) sont taggés "general"
UPDATE newsletter_contacts SET tags = ARRAY['general']::TEXT[] WHERE tags IS NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_contacts_tags ON newsletter_contacts USING GIN (tags);

-- Autoriser la source "manuel" (contacts ajoutés à la main depuis le dashboard)
-- (la colonne source est un simple TEXT, pas de contrainte CHECK à modifier)

COMMENT ON COLUMN newsletter_contacts.tags IS
    'Catégories du contact (ex: general, therapeute, prospect, presse). '
    'Utilisé pour cibler les envois de newsletter/promo depuis le dashboard admin.';
