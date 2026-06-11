-- ============================================================
-- Migration : traçabilité de la source du tirage (QRNG)
-- À exécuter dans Supabase SQL Editor
-- ============================================================
-- Objectif scientifique : ne conserver dans les statistiques de
-- synchronicité QUE les tirages 100% issus de l'API quantique ANU.
-- Tout tirage ayant utilisé le fallback cryptographique local est
-- marqué 'fallback' et doit être EXCLU des analyses.

-- 1. Colonne qrng_source sur observation_windows
ALTER TABLE observation_windows
  ADD COLUMN IF NOT EXISTS qrng_source TEXT NOT NULL DEFAULT 'anu'
  CHECK (qrng_source IN ('anu', 'fallback', 'unknown'));

COMMENT ON COLUMN observation_windows.qrng_source
  IS 'Source du tirage : anu = 100% quantique (ANU), fallback = crypto local (à exclure des stats), unknown = ancien tirage';

-- Les fenêtres créées AVANT cette migration n'ont pas l'info → 'unknown'
-- (on ne peut pas affirmer qu'elles étaient quantiques pures).
UPDATE observation_windows
  SET qrng_source = 'unknown'
  WHERE qrng_source = 'anu'
    AND created_at < NOW() - INTERVAL '1 minute';

-- 2. Mettre à jour la vue synchronicity_stats pour exposer la source
--    (permet de filtrer côté dashboard / analyses sur qrng_source = 'anu')
CREATE OR REPLACE VIEW synchronicity_stats AS
SELECT
  sr.id,
  sr.score_synchronicites,
  sr.types_synchronicites,
  sr.resonance_tirage,
  sr.etat_interieur,
  sr.temoignage,
  sr.created_at,
  ow.duration_days,
  ow.cards,
  ow.closes_at,
  ow.qrng_source          -- 'anu' | 'fallback' | 'unknown'
FROM synchronicity_responses sr
JOIN observation_windows ow ON ow.response_token = sr.response_token;

-- ============================================================
-- Note : pour des statistiques scientifiquement valides, filtrer
-- systématiquement sur  qrng_source = 'anu'.
-- ============================================================
