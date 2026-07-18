-- ============================================================
-- MIGRATION : Registre de fonctionnalités (feature flags)
-- ============================================================
-- Permet d'activer/désactiver depuis le dashboard admin certaines
-- fonctionnalités du site sans redéployer de code.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_flags (
    key         TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    description TEXT,
    category    TEXT DEFAULT 'general',
    enabled     BOOLEAN DEFAULT TRUE,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_service_role" ON feature_flags;
CREATE POLICY "feature_flags_service_role" ON feature_flags
    FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO feature_flags (key, label, description, category) VALUES
    ('referral',                  'Programme de parrainage',                  'Bonus tirage offert au parrain et au filleul quand un lien de parrainage est utilisé.', 'acquisition'),
    ('promo_email_j7',            'Email promo abonnement (J+7)',             'Email "Et si tu allais plus loin avec le Tore ?" envoyé 7 jours après un tirage freemium.', 'emails'),
    ('checkin_email_j3',          'Email check-in synchronicité (J+3)',       'Email de relance douce envoyé 3 jours après un tirage freemium.', 'emails'),
    ('newsletter_scheduled_send', 'Envoi automatique des newsletters programmées', 'Cron qui envoie réellement les newsletters programmées arrivées à échéance.', 'emails'),
    ('audio_livret_prototype',    'Prototype livret audio (ElevenLabs)',      'Génération de voix off à partir d''un texte, dans l''onglet Planning.', 'contenu'),
    ('testimonials_public',       'Témoignages publiés publiquement',         'Affichage des témoignages validés sur oracle.html et via /api/admin/testimonials.', 'contenu'),
    ('synchronicity_study_public','Page publique Étude des synchronicités',   'Agrégats anonymisés exposés via /api/admin/synchronicity-public et affichés sur etude-synchronicites.html.', 'contenu')
ON CONFLICT (key) DO NOTHING;
