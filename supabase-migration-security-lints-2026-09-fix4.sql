-- ============================================================
-- CORRECTIF 4 : rls_enabled_no_policy (INFO) — 17 tables
-- ============================================================
-- Ne change AUCUN comportement réel : ces tables sont déjà totalement
-- verrouillées pour anon/authenticated (RLS activée, aucune policy = accès
-- refusé par défaut), et service_role contourne RLS de toute façon, avec ou
-- sans policy explicite. Ce correctif ajoute juste une policy documentant
-- cet accès service_role — même pattern que suppliers/supplier_files —
-- pour faire disparaître le bruit INFO du rapport Supabase.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_reports', 'guidances', 'intentions_anonymes', 'kickstarter_backers',
    'newsletter_drafts', 'newsletter_ideas', 'observation_windows', 'page_views',
    'qrng_usage', 'resonance_immediate', 'retro_pool', 'retro_preregistration',
    'retro_sessions', 'stripe_monthly_fees', 'system_logs', 'transactions',
    'ulule_backers'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service_role', t
    );
  END LOOP;
END $$;
