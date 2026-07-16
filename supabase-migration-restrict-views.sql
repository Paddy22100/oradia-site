-- Restreindre l'accès aux vues sensibles (admin-only)
-- Ces vues sont en SECURITY DEFINER et accessibles publiquement par défaut.
-- On révoque SELECT sur anon et authenticated : seul service_role y accède
-- (utilisé par les fonctions serverless Vercel via SUPABASE_SERVICE_ROLE_KEY).

REVOKE SELECT ON synchronicity_stats FROM anon;
REVOKE SELECT ON synchronicity_stats FROM authenticated;

REVOKE SELECT ON tore_draw_stats FROM anon;
REVOKE SELECT ON tore_draw_stats FROM authenticated;

-- Vérification : seul service_role doit pouvoir lire ces vues
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_name IN ('synchronicity_stats', 'tore_draw_stats');
