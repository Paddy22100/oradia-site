-- ============================================================
-- MIGRATION : mois d'essai Tore offert via le QR code du livret de l'oracle
-- ============================================================
-- tore_subscriptions.trial_source : 'oracle-qr' quand l'abonnement a démarré par
-- l'essai de 30 jours de la page /oracle-offert (voir lib/oracle-trial.js). Sert à
-- refuser un second essai pour le même email et à compter les essais (plafond).
-- Interrupteur oracle_qr_trial (catégorie Boutique), actif par défaut.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

ALTER TABLE tore_subscriptions ADD COLUMN IF NOT EXISTS trial_source TEXT;
CREATE INDEX IF NOT EXISTS idx_tore_subscriptions_trial_source ON tore_subscriptions (trial_source);

INSERT INTO feature_flags (key, label, description, category, enabled) VALUES
    ('oracle_qr_trial', 'Mois d''essai Tore offert (QR code du livret)',
     'Page /oracle-offert, atteinte par le QR code imprimé dans le livret : 30 jours d''abonnement Tore offerts aux nouveaux abonnés (carte demandée, 8 €/mois ensuite sauf résiliation), dans la limite de ORACLE_TRIAL_MAX essais (1000 par défaut).',
     'boutique', TRUE)
ON CONFLICT (key) DO NOTHING;
