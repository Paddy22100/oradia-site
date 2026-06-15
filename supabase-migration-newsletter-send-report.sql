-- ============================================================
-- MIGRATION : Rapport d'envoi des newsletters ciblées
-- ============================================================
-- Permet de garder une trace, pour chaque brouillon envoyé à une
-- ou plusieurs catégories de contacts, du nombre d'envois réussis,
-- échoués, et de la liste des emails en échec (pour pouvoir les
-- consulter ou relancer manuellement depuis le dashboard admin).
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS sent_count INTEGER;
ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS failed_count INTEGER;
ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS failed_emails JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN newsletter_drafts.failed_emails IS
    'Liste des adresses email pour lesquelles le dernier envoi ciblé a échoué (action=send avec target_tags).';
