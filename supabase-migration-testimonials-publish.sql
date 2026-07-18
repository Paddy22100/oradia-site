-- Migration : publication modérée des témoignages sur le site
-- Ajoute la possibilité de publier un témoignage (type='temoignage' dans
-- support_messages) sur oracle.html depuis le dashboard, après validation
-- manuelle de l'admin — jamais automatique.

ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS published    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_support_messages_published
  ON support_messages(published) WHERE published = true;

COMMENT ON COLUMN support_messages.published IS
  'true = témoignage validé et affiché publiquement sur oracle.html. Réservé aux messages type=temoignage.';
