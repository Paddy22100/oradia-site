-- Tirages programmés (quotidien / hebdomadaire / mensuel, avec intention fixe et
-- heure choisie) : nouvelle table de configuration + colonne "source" sur tirages
-- pour séparer l'historique programmé des tirages ponctuels, avec sa propre
-- rétention (plus courte que les 20 tirages ponctuels déjà en place).
-- À exécuter dans Supabase → SQL Editor.

-- ============ 1. Colonne "source" sur tirages ============
ALTER TABLE tirages
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ponctuel';

COMMENT ON COLUMN tirages.source IS
  'ponctuel = tirage manuel classique. programme = généré automatiquement par une planification (tore_scheduled_draws).';

-- Le trigger existant (trim_tirages_history) plafonnait TOUS les tirages d'un
-- utilisateur à 20, tous confondus. Un tirage programmé quotidien viderait ce
-- quota en moins de 3 semaines et écraserait l'historique ponctuel. On le
-- restreint donc aux tirages ponctuels, et un second trigger gère les
-- tirages programmés avec une rétention plus courte (14).
CREATE OR REPLACE FUNCTION trim_tirages_history() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'ponctuel' THEN
    DELETE FROM tirages
    WHERE user_id = NEW.user_id
      AND source = 'ponctuel'
      AND id NOT IN (
        SELECT id FROM tirages
        WHERE user_id = NEW.user_id AND source = 'ponctuel'
        ORDER BY created_at DESC
        LIMIT 20
      );
  ELSE
    DELETE FROM tirages
    WHERE user_id = NEW.user_id
      AND source = 'programme'
      AND id NOT IN (
        SELECT id FROM tirages
        WHERE user_id = NEW.user_id AND source = 'programme'
        ORDER BY created_at DESC
        LIMIT 14
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ 2. Table de configuration des tirages programmés ============
CREATE TABLE IF NOT EXISTS tore_scheduled_draws (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),   -- 0 = dimanche, requis si weekly
  day_of_month SMALLINT CHECK (day_of_month BETWEEN 1 AND 28), -- requis si monthly (borné à 28 pour rester valable tous les mois)
  hour SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  intention TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('homme', 'femme')),
  active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_date DATE, -- anti-doublon : évite un second envoi si le cron externe tourne plusieurs fois dans l'heure
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Un seul programme actif par utilisateur pour l'instant (simplicité) — on peut
-- lever cette contrainte plus tard si le besoin de plusieurs créneaux apparaît.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tore_scheduled_draws_user ON tore_scheduled_draws(user_id);

ALTER TABLE tore_scheduled_draws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own schedule" ON tore_scheduled_draws;
CREATE POLICY "Users can view own schedule" ON tore_scheduled_draws
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own schedule" ON tore_scheduled_draws;
CREATE POLICY "Users can upsert own schedule" ON tore_scheduled_draws
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own schedule" ON tore_scheduled_draws;
CREATE POLICY "Users can update own schedule" ON tore_scheduled_draws
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own schedule" ON tore_scheduled_draws;
CREATE POLICY "Users can delete own schedule" ON tore_scheduled_draws
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access schedule" ON tore_scheduled_draws;
CREATE POLICY "Service role full access schedule" ON tore_scheduled_draws
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE tore_scheduled_draws IS
  'Planification des tirages automatiques du Tore (réservé aux abonnés) : fréquence, heure, intention fixe. Exécutée par un cron externe qui appelle /api/tirages/send-email?action=run-scheduled-draws toutes les heures.';
