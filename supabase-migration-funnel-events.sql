-- Migration : suivi du funnel de conversion (tirage → email → abonnement)
-- Complète page_views (déjà en place) avec des étapes nommées du parcours,
-- sans cookie tiers ni service externe (Google Analytics n'est pas installé
-- sur le site — ce funnel s'appuie sur l'infrastructure interne existante).

CREATE TABLE IF NOT EXISTS funnel_events (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id  TEXT NOT NULL,
    event_name  TEXT NOT NULL,
    path        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_name    ON funnel_events(event_name);
CREATE INDEX IF NOT EXISTS idx_funnel_events_session ON funnel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_created ON funnel_events(created_at DESC);

ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funnel_events_service_role" ON funnel_events;
CREATE POLICY "funnel_events_service_role" ON funnel_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE funnel_events IS
    'Étapes nommées du parcours de conversion (intention_saisie, tirage_lance, '
    'analyse_affichee, email_laisse), une ligne par occurrence. Les visites et '
    'les achats/abonnements sont déjà mesurés ailleurs (page_views, preorders, '
    'tore_subscriptions) et ne sont pas dupliqués ici.';
