-- ============================================================
-- MIGRATION : corrections des alertes du Security/Performance Advisor Supabase
-- (export "Supabase Performance Security Lints", 2026-09-11)
-- À exécuter manuellement dans Supabase > SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. function_search_path_mutable (WARN) — 11 fonctions
-- ------------------------------------------------------------
-- Une fonction sans search_path fixé peut être détournée si quelqu'un crée un
-- objet de même nom dans un schéma placé plus tôt dans le search_path de
-- l'appelant (search_path hijacking). Fixer search_path='public, pg_temp' ne
-- change aucun comportement, ça verrouille juste la résolution des noms.
--
-- Bloc générique (plutôt que 11 ALTER FUNCTION écrits à la main) : certaines
-- de ces fonctions (trg_trim_audit_reports, set_updated_at,
-- update_updated_at_column, trg_purge_system_logs, handle_stripe_webhook)
-- n'ont pas de fichier de migration correspondant dans ce dépôt (créées à la
-- main dans le SQL Editor) — leur signature exacte n'est donc pas connue
-- depuis le code. pg_get_function_identity_arguments() la lit en direct
-- depuis le catalogue, ce qui évite de deviner et de risquer un ALTER
-- FUNCTION avec la mauvaise liste d'arguments.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'trg_trim_audit_reports',
        'set_updated_at',
        'update_newsletter_contacts_updated_at',
        'update_tore_subscriptions_updated_at',
        'reset_monthly_draw_counts',
        'trim_tirages_history',
        'update_updated_at_column',
        'trim_qrng_usage_history',
        'trg_purge_system_logs',
        'handle_stripe_webhook',
        'trim_page_views_history'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp', r.proname, r.args);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. anon_security_definer_function_executable /
--    authenticated_security_definer_function_executable (WARN) — 4 fonctions
-- ------------------------------------------------------------
-- Ces fonctions sont SECURITY DEFINER (elles s'exécutent avec les droits de
-- leur propriétaire, pas de l'appelant) et sont donc capables de contourner
-- la RLS de la table tirages. Elles ne sont utilisées QUE côté serveur, via
-- la clé service_role (api/admin/index.js, api/stripe-webhook.js) — jamais
-- via le client anon/authenticated exposé au navigateur. Le service_role
-- contourne de toute façon les GRANT/REVOKE PostgREST : lui retirer l'accès
-- à anon/authenticated ne casse rien côté app, et ferme un vrai accès public
-- non voulu à /rest/v1/rpc/admin_get_tirages_by_email et
-- /rest/v1/rpc/admin_get_user_tirages — qui, sans ce correctif, permettent à
-- N'IMPORTE QUI sur internet (anon, pas de connexion requise) de lire les
-- tirages de N'IMPORTE QUEL email/user_id, en contournant la confidentialité
-- normalement garantie par la RLS (voir CLAUDE.md, politique de rétention
-- tirages : "chaque utilisateur ne peut lire QUE ses propres tirages").
REVOKE EXECUTE ON FUNCTION public.admin_get_tirages_by_email(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_tirages(uuid)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_draw_counts()     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trim_tirages_history()          FROM anon, authenticated;

-- ------------------------------------------------------------
-- 3. public_bucket_allows_listing (WARN) — bucket newsletter-uploads
-- ------------------------------------------------------------
-- La politique SELECT actuelle permet à n'importe qui de LISTER tous les
-- fichiers du bucket (énumération), pas seulement de récupérer un fichier
-- dont on connaît déjà l'URL. Un bucket "public" au niveau du bucket
-- lui-même sert déjà les objets via /storage/v1/object/public/... sans
-- passer par cette policy RLS — la retirer ne casse donc pas les URLs
-- publiques déjà utilisées (ensureSafeSocialImageUrl, upload-image, etc.
-- dans api/admin/index.js), seule l'énumération est bloquée.
DROP POLICY IF EXISTS "public read newsletter-uploads" ON storage.objects;

-- ------------------------------------------------------------
-- Non traité dans cette migration — voir le rapport dans la conversation :
--
-- - rls_policy_always_true (intentions_anonymes, INSERT) : très probablement
--   voulu (le formulaire d'intention est rempli par des visiteurs non
--   connectés) — à confirmer avant de restreindre, pas de correctif ici.
--
-- - auth_leaked_password_protection : réglage du dashboard Supabase Auth
--   (Authentication > Policies/Settings > "Leaked password protection"),
--   pas une migration SQL — à activer manuellement.
-- ------------------------------------------------------------
