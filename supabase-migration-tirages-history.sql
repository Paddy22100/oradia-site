-- Migration : historique des tirages côté Supabase, sécurisé par RLS (par user_id)
--
-- CONTEXTE : l'historique des tirages était stocké uniquement dans le
-- localStorage du navigateur, sous une clé partagée par tout le monde.
-- Sur un appareil partagé entre plusieurs comptes, chacun voyait l'historique
-- des autres. Cette migration déplace le stockage côté serveur (Supabase),
-- avec une politique RLS stricte : chaque utilisateur ne peut lire/écrire QUE
-- ses propres tirages (auth.uid() = user_id).
--
-- À exécuter dans l'éditeur SQL de Supabase (Dashboard > SQL Editor).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tirages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'Tirage Tore',
    intention TEXT,
    cartes JSONB DEFAULT '[]',          -- liste des noms de cartes tirées
    passerelles JSONB DEFAULT '[]',     -- [{ carte, passerelle }, ...]
    interpretations JSONB DEFAULT '[]', -- [{ position, carte, texte }, ...]
    synthese TEXT,
    observation_window JSONB,           -- { days, attentionPoints, ... }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tirages_user_id ON tirages(user_id);
CREATE INDEX IF NOT EXISTS idx_tirages_user_created ON tirages(user_id, created_at DESC);

-- Limiter l'historique à 20 entrées par utilisateur (purge automatique des plus anciennes)
CREATE OR REPLACE FUNCTION trim_tirages_history() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM tirages
    WHERE user_id = NEW.user_id
      AND id NOT IN (
        SELECT id FROM tirages
        WHERE user_id = NEW.user_id
        ORDER BY created_at DESC
        LIMIT 20
      );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_trim_tirages_history ON tirages;
CREATE TRIGGER trg_trim_tirages_history
    AFTER INSERT ON tirages
    FOR EACH ROW EXECUTE FUNCTION trim_tirages_history();

-- ============ RLS ============
ALTER TABLE tirages ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne peut lire que SES propres tirages
DROP POLICY IF EXISTS "Users can view own tirages" ON tirages;
CREATE POLICY "Users can view own tirages" ON tirages
    FOR SELECT
    USING (auth.uid() = user_id);

-- Chaque utilisateur ne peut insérer que SES propres tirages
DROP POLICY IF EXISTS "Users can insert own tirages" ON tirages;
CREATE POLICY "Users can insert own tirages" ON tirages
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Chaque utilisateur peut supprimer SES propres tirages (ex: depuis "Mes paramètres")
DROP POLICY IF EXISTS "Users can delete own tirages" ON tirages;
CREATE POLICY "Users can delete own tirages" ON tirages
    FOR DELETE
    USING (auth.uid() = user_id);

-- Le service_role (utilisé par les fonctions serverless avec la clé SERVICE_ROLE)
-- garde un accès complet pour les besoins serveur (ex: nettoyage, exports admin)
DROP POLICY IF EXISTS "Service role full access tirages" ON tirages;
CREATE POLICY "Service role full access tirages" ON tirages
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE tirages IS 'Historique des tirages des membres — accès restreint par RLS (auth.uid() = user_id). Remplace le stockage localStorage côté navigateur (problème de confidentialité corrigé).';
