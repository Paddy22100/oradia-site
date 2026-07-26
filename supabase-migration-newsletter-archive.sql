-- Archivage des newsletters passées
-- Ajoute un booléen pour sortir une newsletter envoyée de la liste de travail
-- sans la supprimer (elle reste consultable via « Voir les archivées »).
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE newsletter_drafts
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN newsletter_drafts.archived IS
  'true = newsletter archivée (masquée de la liste active des communications, conservée pour consultation/réutilisation).';
