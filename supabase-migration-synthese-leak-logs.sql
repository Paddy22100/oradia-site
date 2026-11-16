-- Garde-fou de production pour la lecture fractale (voir lib/structure/anti-fuite.js,
-- lib/structure/derivees.js) : journalise, sans bloquer l'affichage ni collecter de
-- donnée personnelle, toute mention de la tradition sous-jacente ou de jargon
-- technique détectée dans une synthèse générée par l'IA — pour que Rudy puisse ajuster
-- le prompt si le modèle laisse passer une fuite malgré les interdits absolus.

CREATE TABLE IF NOT EXISTS synthese_leak_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,          -- 'terme' (jargon) ou 'nom_figure'
  terme TEXT NOT NULL,
  numero_figure INTEGER,       -- renseigné uniquement si type = 'nom_figure'
  excerpt TEXT NOT NULL,       -- extrait de contexte, jamais le texte complet ni de donnée personnelle
  lang TEXT NOT NULL DEFAULT 'fr',
  source TEXT NOT NULL,        -- 'stream' (tirage manuel) ou 'json' (tirages programmés/hebdo)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synthese_leak_logs_created_at
  ON synthese_leak_logs (created_at DESC);

ALTER TABLE synthese_leak_logs ENABLE ROW LEVEL SECURITY;
