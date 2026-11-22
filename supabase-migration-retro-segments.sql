-- Étude rétrocausalité — segmentations exploratoires (voir lib/retro-stats.js) :
-- résonance subjective déclarée et concurrence de tirages, discutées avec Rudy comme
-- alternatives au protocole "groupe A / groupe B" de Philippe Guillemant (nombre
-- quantique partagé entre plusieurs personnes), jugé contestable (prédiction
-- dépendante d'un modèle causal particulier, risque d'artefact dans la fonction de
-- mélange individu+nombre partagé) et surtout incompatible avec la garantie actuelle
-- "un nombre scellé n'est jamais consommé deux fois" qui rend l'étude passé/futur
-- déjà en place défendable. Ces deux segmentations ne redéfinissent PAS la table
-- retro_preregistration (ligne figée, jamais modifiée) : ce sont des hypothèses
-- EXPLORATOIRES, enregistrées séparément et après coup — à ne jamais présenter avec
-- la même confiance que H1/H2 tant qu'elles n'ont pas été répliquées sur des données
-- postérieures à leur enregistrement.

-- ── Lien résonance subjective : la fenêtre d'observation doit porter le même
-- session_id que /api/admin/experiment-record pour pouvoir la relier à la session
-- de l'étude rétrocausalité (jointure faite en JS, voir /experiment-stats).
ALTER TABLE observation_windows ADD COLUMN IF NOT EXISTS session_id TEXT;
CREATE INDEX IF NOT EXISTS idx_observation_windows_session_id
  ON observation_windows (session_id) WHERE session_id IS NOT NULL;

-- ── Registre des hypothèses exploratoires (distinct de retro_preregistration,
-- qui reste intouché) : chaque ligne documente QUAND une segmentation a commencé à
-- être calculée, pour que toute donnée antérieure à cette date soit lue comme
-- rétrospective (risque de sélection après coup) plutôt que comme confirmatoire.
CREATE TABLE IF NOT EXISTS public.retro_exploratory_hypotheses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    label TEXT NOT NULL UNIQUE,
    hypothesis TEXT NOT NULL
);
ALTER TABLE public.retro_exploratory_hypotheses ENABLE ROW LEVEL SECURITY;

INSERT INTO public.retro_exploratory_hypotheses (label, hypothesis)
SELECT 'resonance_subjective',
  'Le taux de correspondance (passé/futur vs présent) diffère selon que l''utilisateur rapporte ensuite, via le questionnaire de fenêtre d''observation, une résonance forte (fort / plutôt oui) ou faible (peu / non) avec son tirage.'
WHERE NOT EXISTS (SELECT 1 FROM public.retro_exploratory_hypotheses WHERE label = 'resonance_subjective');

INSERT INTO public.retro_exploratory_hypotheses (label, hypothesis)
SELECT 'concurrence_tirages',
  'Le taux de correspondance (passé/futur vs présent) diffère selon qu''une autre session de l''étude avait une intention_at à moins de 10 minutes (session "accompagnée") ou non (session "solo").'
WHERE NOT EXISTS (SELECT 1 FROM public.retro_exploratory_hypotheses WHERE label = 'concurrence_tirages');
