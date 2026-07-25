-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTUDE RÉTROCAUSALITÉ ORADIA
-- Teste si un nombre quantique fixé AVANT (passé) ou APRÈS (futur) le tirage
-- corrèle avec le tirage du moment (présent), au-delà du hasard.
--   • pré-tiré  (passé)   : scellé avant l'intention
--   • en direct (présent) : généré au moment du tirage
--   • post-tiré (futur)   : scellé juste après, révélé plus tard
-- Chaque lot quantique est engagé par un hash SHA-256 + horodatage (infalsifiable).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Pool de nombres quantiques pré-scellés (sert de "passé" et de "futur") ──
CREATE TABLE IF NOT EXISTS public.retro_pool (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id TEXT NOT NULL,                 -- identifiant du lot ANU
    batch_hash TEXT NOT NULL,               -- SHA-256 du lot entier = engagement infalsifiable
    committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- date de scellement (preuve d'antériorité)
    byte_value SMALLINT NOT NULL,           -- octet quantique brut (0-255)
    bit_value SMALLINT NOT NULL,            -- bit dérivé : byte >= 128 ? 1 : 0
    qrng_source TEXT NOT NULL DEFAULT 'anu',
    consumed_at TIMESTAMPTZ,                -- date d'utilisation (null = disponible)
    consumed_role TEXT,                     -- 'past' | 'future'
    consumed_session TEXT                   -- session qui l'a consommé
);
CREATE INDEX IF NOT EXISTS idx_retro_pool_committed ON public.retro_pool (committed_at);
CREATE INDEX IF NOT EXISTS idx_retro_pool_available ON public.retro_pool (consumed_at) WHERE consumed_at IS NULL;

-- ── Sessions de l'étude : une ligne par consultation ──
CREATE TABLE IF NOT EXISTS public.retro_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    session_id TEXT,
    intention_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- l'acte "présent"

    -- Présent : nombre généré AU MOMENT du tirage
    present_byte SMALLINT,
    present_bit SMALLINT,

    -- Passé : nombre pré-tiré, scellé AVANT l'intention
    past_bit SMALLINT,
    past_committed_at TIMESTAMPTZ,
    past_commit_hash TEXT,

    -- Futur : nombre post-tiré, scellé APRÈS l'intention, révélé plus tard
    future_bit SMALLINT,
    future_committed_at TIMESTAMPTZ,
    future_commit_hash TEXT,
    future_resolved_at TIMESTAMPTZ,

    qrng_source TEXT,                       -- 'anu' requis pour la validité scientifique
    status TEXT NOT NULL DEFAULT 'pending'  -- pending | complete | excluded
);
CREATE INDEX IF NOT EXISTS idx_retro_sessions_status ON public.retro_sessions (status);
CREATE INDEX IF NOT EXISTS idx_retro_sessions_created ON public.retro_sessions (created_at);

-- Accès service_role uniquement (fonctions serverless) : RLS activé, aucune policy publique.
ALTER TABLE public.retro_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retro_sessions ENABLE ROW LEVEL SECURITY;

-- ── Registre de pré-enregistrement (hypothèses figées AVANT toute donnée) ──
-- Une seule ligne, insérée à la mise en place, jamais modifiée : c'est la preuve
-- que les critères d'analyse ont été fixés à l'avance (anti "p-hacking").
CREATE TABLE IF NOT EXISTS public.retro_preregistration (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    hypotheses TEXT NOT NULL,
    primary_metric TEXT NOT NULL,
    target_n INT NOT NULL,
    alpha NUMERIC NOT NULL,
    two_sided BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.retro_preregistration ENABLE ROW LEVEL SECURITY;

INSERT INTO public.retro_preregistration (hypotheses, primary_metric, target_n, alpha, two_sided)
SELECT
  'H1 (passé→présent) : le bit pré-tiré (scellé avant) correspond au bit du tirage présent à un taux ≠ 50%. '
  || 'H2 (futur→présent) : le bit post-tiré (scellé après) correspond au bit du tirage présent à un taux ≠ 50%. '
  || 'H0 : les deux taux = 50% (indépendance / aucun effet).',
  'Taux de correspondance de bits (present_bit vs past_bit / future_bit), test binomial bilatéral vs baseline marginale.',
  10000, 0.05, true
WHERE NOT EXISTS (SELECT 1 FROM public.retro_preregistration);
