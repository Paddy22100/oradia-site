-- ============================================================
-- Migration : Système de suivi des synchronicités (#31)
-- À exécuter dans Supabase SQL Editor
-- Date : juin 2026
-- ============================================================

-- 1. Ajouter response_token à observation_windows
--    Token UUID unique généré automatiquement à la création de chaque fenêtre.
--    Ce token est envoyé dans l'email de clôture pour identifier la réponse
--    sans stocker l'email dans la table des réponses (pseudonymisation RGPD).

ALTER TABLE observation_windows
  ADD COLUMN IF NOT EXISTS response_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- Backfill pour les fenêtres existantes (20 lignes)
UPDATE observation_windows
  SET response_token = gen_random_uuid()
  WHERE response_token IS NULL;

-- 2. Table synchronicity_responses
--    Stocke uniquement le token + les réponses au questionnaire.
--    Jamais d'email ici — le lien token → email est dans observation_windows
--    (accessible uniquement via service_role, pas exposé publiquement).

CREATE TABLE IF NOT EXISTS synchronicity_responses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_token        UUID NOT NULL UNIQUE REFERENCES observation_windows(response_token) ON DELETE CASCADE,
  observation_window_id UUID REFERENCES observation_windows(id) ON DELETE CASCADE,

  -- Q1 : Intensité perçue (1-10)
  score_synchronicites  SMALLINT NOT NULL CHECK (score_synchronicites BETWEEN 1 AND 10),

  -- Q2 : Types de synchronicités (tableau de chaînes)
  types_synchronicites  TEXT[] DEFAULT '{}',

  -- Q3 : Résonance avec le tirage
  resonance_tirage      TEXT CHECK (resonance_tirage IN ('fort', 'plutot_oui', 'peu', 'non')),

  -- Q4 : État intérieur pendant la période
  etat_interieur        TEXT CHECK (etat_interieur IN ('calme', 'alerte', 'neutre', 'perturbe')),

  -- Q5 : Témoignage libre (optionnel)
  temoignage            TEXT,

  -- Métadonnées
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Index pour les analyses par date
CREATE INDEX IF NOT EXISTS idx_sync_responses_created
  ON synchronicity_responses(created_at DESC);

-- 3. RLS : lecture/écriture uniquement via service_role (données de recherche)
ALTER TABLE synchronicity_responses ENABLE ROW LEVEL SECURITY;

-- Interdire tout accès public
CREATE POLICY "service_role_only" ON synchronicity_responses
  USING (auth.role() = 'service_role');

-- 4. Vue agrégée pour le dashboard admin (lecture seule, données anonymisées)
--    Rejoint avec observation_windows pour avoir les métadonnées du tirage
--    mais SANS l'email — la jointure ne retourne que des données de recherche.

CREATE OR REPLACE VIEW synchronicity_stats AS
SELECT
  sr.id,
  sr.score_synchronicites,
  sr.types_synchronicites,
  sr.resonance_tirage,
  sr.etat_interieur,
  sr.temoignage,
  sr.created_at,
  -- Métadonnées du tirage (sans email)
  ow.duration_days,
  ow.cards,
  ow.closes_at
FROM synchronicity_responses sr
JOIN observation_windows ow ON ow.response_token = sr.response_token;

-- ============================================================
-- Notes RGPD
-- ============================================================
-- • La table synchronicity_responses ne contient JAMAIS d'email.
-- • Le lien email ↔ token est dans observation_windows (service_role only).
-- • Pour une étude scientifique, utiliser la vue synchronicity_stats
--   qui ne retourne aucune donnée personnelle identifiable.
-- • Les réponses sont supprimées en cascade si la fenêtre est supprimée.
-- ============================================================
