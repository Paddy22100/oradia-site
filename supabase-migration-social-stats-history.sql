-- Historise un instantané quotidien des abonnés Instagram (et Facebook, pour
-- rester cohérent si un jour l'API Facebook cesse de fournir la croissance
-- directement). Permet de calculer une croissance sur 7 jours nous-mêmes,
-- puisque l'API Instagram ne la fournit pas sans instagram_manage_insights
-- (permission avancée non encore validée par Meta).
CREATE TABLE IF NOT EXISTS social_stats_history (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  snapshot_date DATE NOT NULL,
  followers INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_social_stats_history_platform_date ON social_stats_history(platform, snapshot_date DESC);

COMMENT ON TABLE social_stats_history IS 'Instantanés quotidiens du nombre d''abonnés par réseau social, pour calculer une croissance sur N jours sans dépendre des Insights Meta.';
