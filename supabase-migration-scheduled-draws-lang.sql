-- Langue des tirages programmés (analyse IA + email) : 'fr' par défaut, 'en' quand la
-- planification est enregistrée depuis l'espace membre en anglais (js/member-i18n.js).
-- Appliquée en production le 2026-10-01.
ALTER TABLE public.tore_scheduled_draws ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'fr';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tore_scheduled_draws_lang_check') THEN
    ALTER TABLE public.tore_scheduled_draws ADD CONSTRAINT tore_scheduled_draws_lang_check CHECK (lang IN ('fr','en'));
  END IF;
END $$;
