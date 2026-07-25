-- Table de suivi de la consommation du hasard quantique ANU, alimentée par api/qrng.js
-- à chaque appel GET /api/qrng. Sert au compteur de quota et au diagnostic des fallbacks
-- (clé manquante, timeout, erreur HTTP) affichés dans le dashboard admin (onglet Analytique).

CREATE TABLE IF NOT EXISTS public.qrng_usage (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    outcome TEXT NOT NULL CHECK (outcome IN ('anu', 'fallback')), -- 'anu' = quota consommé, 'fallback' = repli crypto
    status_code INT,        -- code HTTP renvoyé par l'API ANU (null si pas de réponse)
    reason TEXT,            -- raison du fallback : missing_api_key | timeout | http_401 | ...
    count INT               -- nombre d'octets demandés dans cet appel
);

CREATE INDEX IF NOT EXISTS idx_qrng_usage_created_at ON public.qrng_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_qrng_usage_outcome ON public.qrng_usage (outcome);

ALTER TABLE public.qrng_usage ENABLE ROW LEVEL SECURITY;

-- Aucune lecture/écriture publique : seules les fonctions serverless (service_role) y accèdent.
-- (le service_role contourne RLS par défaut sur Supabase, donc aucune policy n'est nécessaire ici)

-- Purge automatique : conserver 13 mois d'historique (comparaison d'une année sur l'autre)
CREATE OR REPLACE FUNCTION public.trim_qrng_usage_history()
RETURNS void AS $$
BEGIN
    DELETE FROM public.qrng_usage WHERE created_at < now() - interval '13 months';
END;
$$ LANGUAGE plpgsql;
