-- ============================================================
-- MIGRATION : Ajout du texte LinkedIn aux publications sociales programmées
-- ============================================================
-- Étend social_posts (voir supabase-migration-social-posts.sql) avec un
-- texte dédié LinkedIn, généré et envoyé en même temps que Facebook et
-- Instagram vers le webhook Make.com. Nécessite d'ajouter un module
-- LinkedIn au scénario Make.com qui reçoit déjà MAKE_SOCIAL_WEBHOOK_URL.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS linkedin_text TEXT;
