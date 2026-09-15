-- Ajoute une colonne utm_source à page_views, pour distinguer le trafic payant
-- (Google Ads notamment) du trafic organique dans les statistiques internes —
-- sans balise Google ni cookie tiers, uniquement à partir du paramètre
-- ?utm_source=... déjà présent dans l'URL de destination de la campagne.
-- Voir js/page-tracker.js (capture) et api/admin/index.js /track (stockage).

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS utm_source TEXT;

COMMENT ON COLUMN page_views.utm_source IS 'Paramètre ?utm_source=... de l''URL au moment de la visite (ex: google_ads), capturé une fois par session par js/page-tracker.js. NULL = trafic sans UTM (organique, direct, etc.)';

CREATE INDEX IF NOT EXISTS idx_page_views_utm_source ON page_views(utm_source) WHERE utm_source IS NOT NULL;
