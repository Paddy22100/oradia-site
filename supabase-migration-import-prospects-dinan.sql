-- ============================================================
-- IMPORT : Prospects thérapeutes/praticiens bien-être — Dinan
-- ============================================================
-- Premier lot de démarchage B2B (partenariat / revente de
-- l'Oracle physique). Sourcé manuellement (recherche web,
-- sites publics des praticiens) le 2026-07-18.
--
-- IMPORTANT : brevo_synced = FALSE volontairement. Ce sont des
-- prospects froids, pas des inscrits newsletter — ils ne doivent
-- JAMAIS recevoir d'envoi groupé automatique (RGPD). Contact à
-- faire manuellement (téléphone / message perso) par Rudy.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

INSERT INTO newsletter_contacts (email, full_name, source, status, tags, brevo_synced, notes)
VALUES (
    'naturantalgie@gmail.com',
    'Ludivine Tavernier — Naturantalgie',
    'prospect-manuel',
    'active',
    ARRAY['therapeute', 'prospect-dinan']::TEXT[],
    FALSE,
    'Naturopathe réflexologue & massothérapeute (Ayurvédique + MTC). 27B Route de Langrolay, 22490 Pleslin-Trigavou (agglo Dinan). Tél. 06 15 23 96 04. Site : naturantalgie.com. Trouvée via recherche web le 18/07/2026 — email public vérifié.'
)
ON CONFLICT (email) DO UPDATE SET
    tags = ARRAY(SELECT DISTINCT unnest(newsletter_contacts.tags || EXCLUDED.tags)),
    notes = EXCLUDED.notes;
