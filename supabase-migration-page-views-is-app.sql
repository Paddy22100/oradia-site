-- Ajoute une colonne is_app à page_views, pour distinguer les visites faites
-- depuis l'application mobile native (Capacitor) des visites web classiques.
-- Permet à l'onglet Analytiques du dashboard admin de mesurer l'usage réel
-- de l'app (nombre de sessions, pages consultées, horaires) en plus du web.

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS is_app BOOLEAN DEFAULT false;

COMMENT ON COLUMN page_views.is_app IS 'true si la vue provient de l''app mobile native (window.Capacitor.isNativePlatform())';

CREATE INDEX IF NOT EXISTS idx_page_views_is_app ON page_views(is_app) WHERE is_app = true;
