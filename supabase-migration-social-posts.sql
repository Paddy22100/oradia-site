-- ============================================================
-- MIGRATION : Publications sociales programmées (Facebook/Instagram)
-- ============================================================
-- Permet de préparer plusieurs publications Facebook/Instagram à
-- l'avance depuis le dashboard admin, avec une date d'envoi chacune.
-- Un cron (réutilise le job cron-job.org existant, action
-- cron-send-scheduled) vérifie toutes les 15 minutes les posts dus
-- et déclenche Facebook + Instagram ENSEMBLE au même moment, pour
-- éviter la désynchronisation entre les deux réseaux.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS social_posts (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subject         TEXT,
    facebook_text   TEXT NOT NULL,
    instagram_text  TEXT NOT NULL,
    image_url       TEXT,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    statut          TEXT DEFAULT 'programmé' CHECK (statut IN ('programmé', 'envoyé', 'échec')),
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    sent_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_social_posts_due ON social_posts(scheduled_at) WHERE statut = 'programmé';

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_posts_service_role" ON social_posts;
CREATE POLICY "social_posts_service_role" ON social_posts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Nouvelle entrée dans le registre de fonctionnalités (si la table existe déjà)
INSERT INTO feature_flags (key, label, description, category)
VALUES ('social_scheduled_send', 'Envoi automatique des publications sociales programmées', 'Cron qui publie réellement sur Facebook/Instagram les posts programmés arrivés à échéance.', 'emails')
ON CONFLICT (key) DO NOTHING;
