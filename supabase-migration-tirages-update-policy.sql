-- Migration : ajoute la policy RLS UPDATE manquante sur `tirages`
--
-- CONTEXTE : la migration d'origine (supabase-migration-tirages-history.sql)
-- a créé des policies RLS pour SELECT, INSERT et DELETE sur `tirages`, mais
-- a oublié UPDATE. Résultat : la complétion d'un tirage déjà enregistré
-- (ajout de l'analyse IA / synthèse / fenêtre d'observation, faite par
-- tore-analysis.html une fois l'analyse générée) échouait systématiquement
-- pour TOUT LE MONDE — Postgres bloque silencieusement l'UPDATE car aucune
-- policy ne l'autorise pour un utilisateur normal (seul service_role, avec
-- sa policy FOR ALL, pouvait le faire). Le tirage se retrouvait enregistré
-- avec les cartes mais sans analyse ("Aucune analyse enregistrée pour ce
-- tirage" dans l'historique et le PDF), quel que soit l'appareil ou le compte.
--
-- À exécuter dans l'éditeur SQL de Supabase (Dashboard > SQL Editor).

DROP POLICY IF EXISTS "Users can update own tirages" ON tirages;
CREATE POLICY "Users can update own tirages" ON tirages
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Vérification : doit maintenant lister 5 policies (SELECT, INSERT, UPDATE,
-- DELETE pour les utilisateurs + FOR ALL pour service_role)
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'tirages'::regclass;
