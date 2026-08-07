-- Ajoute la colonne manquante pour la section "Ce que cela vous invite à explorer"
-- (affichée sous le titre "Pistes à explorer" sur tore-analysis.html), jusqu'ici
-- générée par l'IA mais jamais persistée : ni dans l'historique de l'espace membre,
-- ni dans le mail envoyé, ni dans le PDF téléchargeable. Mêmes conventions que les
-- colonnes synthese / analyse_ia déjà en place sur la table tirages.
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE tirages
  ADD COLUMN IF NOT EXISTS pistes text;

COMMENT ON COLUMN tirages.pistes IS
  'Section "Ce que cela vous invite à explorer" (pistes concrètes) générée par l''IA, affichée entre l''analyse et la synthèse.';
