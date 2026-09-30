-- Langue de l'email de clôture d'une fenêtre d'observation ('fr' | 'en'), et donc du
-- questionnaire vers lequel il renvoie (synchronicite.html / en/synchronicite.html).
-- Renseignée à l'activation (api/fenetre/index.js, lang: 'en' depuis /en/tore-analysis.html).
ALTER TABLE public.observation_windows
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'fr';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'observation_windows_lang_check') THEN
    ALTER TABLE public.observation_windows
      ADD CONSTRAINT observation_windows_lang_check CHECK (lang IN ('fr', 'en'));
  END IF;
END $$;
