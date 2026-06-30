-- Table de suivi du trafic réel du site (pages vues), alimentée par js/page-tracker.js
-- via la route publique POST /api/admin/track

CREATE TABLE IF NOT EXISTS public.page_views (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    path TEXT NOT NULL,
    referrer TEXT,
    session_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views (created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON public.page_views (session_id);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Aucune lecture/écriture publique : seules les fonctions serverless (service_role) y accèdent.
-- (le service_role contourne RLS par défaut sur Supabase, donc aucune policy n'est nécessaire ici)

-- Purge automatique : conserver 90 jours de données de trafic
CREATE OR REPLACE FUNCTION public.trim_page_views_history()
RETURNS void AS $$
BEGIN
    DELETE FROM public.page_views WHERE created_at < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql;
