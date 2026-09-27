-- ============================================================
-- CORRECTIF : le REVOKE précédent (supabase-migration-security-lints-2026-09.sql)
-- n'a pas suffi pour admin_get_tirages_by_email et reset_monthly_draw_counts.
-- ============================================================
-- Vérifié après coup avec la clé anon : ces deux fonctions restaient
-- appelables malgré le "REVOKE EXECUTE ... FROM anon, authenticated".
-- Cause probable : PostgreSQL accorde EXECUTE au pseudo-rôle PUBLIC par
-- défaut à la création d'une fonction, et anon/authenticated en héritent
-- automatiquement — révoquer nommément anon/authenticated ne suffit pas tant
-- que PUBLIC garde ce droit. Ce correctif révoque aussi PUBLIC, pour les 4
-- fonctions (les 2 qui semblaient déjà bloquées y compris, sans risque à le
-- refaire).
REVOKE EXECUTE ON FUNCTION public.admin_get_tirages_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_tirages(uuid)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_draw_counts()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trim_tirages_history()          FROM PUBLIC;

-- Sécurité supplémentaire : redonne explicitement l'accès à service_role
-- (au cas où REVOKE FROM PUBLIC l'aurait aussi retiré à ce rôle — service_role
-- contourne normalement tout ça, mais autant l'expliciter pour ne rien laisser
-- au hasard sur ces 4 fonctions précises).
GRANT EXECUTE ON FUNCTION public.admin_get_tirages_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_tirages(uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_monthly_draw_counts()     TO service_role;
GRANT EXECUTE ON FUNCTION public.trim_tirages_history()          TO service_role;
