-- ============================================================
-- Migration : support multi-sources pour le hasard quantique (QRNG)
-- À exécuter dans Supabase SQL Editor, APRÈS supabase-migration-qrng-source.sql
-- ============================================================
-- Contexte : jusqu'ici, seule l'API ANU alimentait les tirages, et 'anu' était
-- le seul label de source "pure" (quantique vérifié). L'ajout d'Outshift QRNG
-- (Cisco, matériel quantique propre) comme 2e source nécessite d'élargir les
-- valeurs acceptées SANS changer le sens des lignes existantes : une ligne
-- historique marquée 'anu' a bien été générée par ANU, pas par une source
-- générique. On ajoute donc 'outshift' comme nouvelle valeur distincte,
-- toutes deux considérées "pures" pour l'étude.

-- 1. observation_windows.qrng_source : autoriser 'outshift' en plus
ALTER TABLE observation_windows DROP CONSTRAINT IF EXISTS observation_windows_qrng_source_check;
ALTER TABLE observation_windows
  ADD CONSTRAINT observation_windows_qrng_source_check
  CHECK (qrng_source IN ('anu', 'outshift', 'fallback', 'unknown'));

COMMENT ON COLUMN observation_windows.qrng_source
  IS 'Source du tirage : anu | outshift = quantique vérifié (valide pour l''étude), fallback = crypto local (exclu), unknown = tirage antérieur au tracking';

-- 2. qrng_usage.outcome : autoriser 'outshift' en plus
ALTER TABLE public.qrng_usage DROP CONSTRAINT IF EXISTS qrng_usage_outcome_check;
ALTER TABLE public.qrng_usage
  ADD CONSTRAINT qrng_usage_outcome_check
  CHECK (outcome IN ('anu', 'outshift', 'fallback'));

-- ============================================================
-- Note : pour des statistiques scientifiquement valides, filtrer désormais sur
--   qrng_source IN ('anu', 'outshift')
-- au lieu de  qrng_source = 'anu'  (voir synchronicity_stats et le dashboard admin).
-- ============================================================
