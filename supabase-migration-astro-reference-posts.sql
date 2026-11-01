-- Table des posts de référence d'un compte d'astrologie externe (Allô Allô Mercure),
-- alimentée automatiquement par un scénario Make qui surveille la page Facebook
-- publique et pousse chaque nouveau post vers api/admin/index.js (action
-- ingest-astro-reference-post, authentifiée par CRON_SECRET, même mécanisme que les
-- autres tâches automatiques externes — voir handleData()).
-- Utilisée par runWeeklyTirageCron (api/admin/index.js) : le post le plus récent sert
-- d'inspiration au prompt du tirage hebdomadaire (lib/tore-analysis-prompt.js), jamais
-- recopié tel quel.
-- service_role uniquement (aucun accès client), comme app_settings.

CREATE TABLE IF NOT EXISTS astro_reference_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'allo_allo_mercure',
  post_text TEXT NOT NULL,
  post_url TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_astro_reference_posts_created_at
  ON astro_reference_posts (created_at DESC);

ALTER TABLE astro_reference_posts ENABLE ROW LEVEL SECURITY;
