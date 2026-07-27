-- Résonance immédiate : note de 1 à 10 donnée juste après l'analyse du tirage
-- (distincte de l'étude des synchronicités, qui elle mesure ce qui est observé
-- dans les jours suivants via le questionnaire post-fenêtre d'observation).
-- À exécuter dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS resonance_immediate (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score         smallint NOT NULL CHECK (score >= 1 AND score <= 10),
  intention     text,
  cards         jsonb DEFAULT '[]'::jsonb,
  qrng_source   text,
  email         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resonance_immediate_created_at ON resonance_immediate (created_at DESC);

ALTER TABLE resonance_immediate ENABLE ROW LEVEL SECURITY;

-- Aucune politique publique : uniquement accessible via service_role (fonctions serverless).
