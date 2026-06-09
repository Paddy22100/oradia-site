-- Migration : ajout colonne analyse_ia dans la table tirages
-- À exécuter dans Supabase SQL Editor
-- Stocke le texte complet de l'analyse IA (Claude) pour le PDF des tirages

ALTER TABLE tirages
  ADD COLUMN IF NOT EXISTS analyse_ia TEXT;

COMMENT ON COLUMN tirages.analyse_ia
  IS 'Analyse IA complète générée par Claude Haiku — texte brut avec sections Markdown. Utilisé pour le PDF téléchargeable.';
