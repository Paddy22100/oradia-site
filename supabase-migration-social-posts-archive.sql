-- Archivage des publications réseaux sociaux
-- Ajoute un booléen pour sortir une publication publiée/en échec de la liste
-- « Publiés récemment » sans la supprimer (consultable via « Voir les archivés »).
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN social_posts.archived IS
  'true = publication archivée (masquée de l''historique actif, conservée pour consultation).';
