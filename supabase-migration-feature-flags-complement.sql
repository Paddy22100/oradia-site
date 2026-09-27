-- ============================================================
-- MIGRATION : interrupteurs manquants dans le registre de fonctionnalités
-- ============================================================
-- Ces 4 clés sont testées dans le code (isFeatureEnabled) mais n'avaient jamais
-- été insérées : absentes de la table, elles étaient considérées comme actives
-- (fail-open) et n'apparaissaient pas dans Dashboard > Paramètres >
-- Fonctionnalités — impossible de les couper sans passer par Supabase.
-- Insérées actives : aucun changement de comportement.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

INSERT INTO feature_flags (key, label, description, category, enabled) VALUES
    ('newsletter_campagne_ciblee',     'Newsletter ciblée en campagne Brevo',       'Envoi des newsletters ciblées sous forme de campagne Brevo (canal marketing). Désactivé : retour à l''ancien envoi transactionnel contact par contact.', 'emails', TRUE),
    ('newsletter_parcours_individuel', 'Parcours newsletter individualisé',         'Cron du mercredi qui envoie à chaque contact l''étape suivante de son propre parcours. Désactivé : retour à la diffusion groupée manuelle.', 'emails', TRUE),
    ('relance_inactifs_30j',           'Email de relance des inactifs (J+30)',      'Email envoyé aux personnes sans tirage depuis 30 jours.', 'emails', TRUE),
    ('retro_study_public',             'Page publique Étude passé/présent/futur',   'Résultats agrégés exposés via /api/admin/experiment-public et affichés sur etude-retrocausalite.html.', 'contenu', TRUE)
ON CONFLICT (key) DO NOTHING;
