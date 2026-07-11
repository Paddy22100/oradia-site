-- Migration : ajout colonne intention dans la table tirages (si absente)
-- À exécuter dans Supabase > SQL Editor
--
-- Contexte : la colonne intention TEXT est définie dans supabase-migration-tirages-history.sql,
-- mais si une version antérieure de la migration a été appliquée sans cette colonne,
-- PostgREST l'ignore silencieusement lors des INSERT (pas d'erreur, valeur perdue).
-- Cette migration corrige la situation sans risque de doublon (IF NOT EXISTS).

ALTER TABLE tirages
  ADD COLUMN IF NOT EXISTS intention TEXT;

COMMENT ON COLUMN tirages.intention
  IS 'Intention formulée par l''utilisateur au moment du tirage. Utilisée pour l''analyse éditoriale Insights du dashboard admin.';

-- Vérification : affiche le nombre de tirages avec une intention renseignée
SELECT
  COUNT(*) FILTER (WHERE intention IS NOT NULL AND intention <> '') AS tirages_avec_intention,
  COUNT(*) AS tirages_total
FROM tirages;
