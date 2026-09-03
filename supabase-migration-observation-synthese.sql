-- Migration : ajoute la synthèse du tirage à la fenêtre d'observation
-- Permet d'afficher le 3e paragraphe (« Synthèse ») de l'analyse du tirage dans
-- le mail de clôture de fenêtre d'observation, envoyé plusieurs jours après le
-- tirage — sans lui, l'utilisateur ne se souvient souvent plus du contenu de son
-- tirage, ce qui n'incite pas à répondre au questionnaire de synchronicité.

ALTER TABLE observation_windows
  ADD COLUMN IF NOT EXISTS synthese TEXT;

COMMENT ON COLUMN observation_windows.synthese IS
  'Paragraphe de synthèse de l''analyse du tirage (section "Synthèse" générée par '
  'l''IA), affiché dans le mail de clôture pour rappeler le contenu du tirage.';
