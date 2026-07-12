-- Migration : amélioration table page_views
-- À exécuter dans Supabase > SQL Editor

ALTER TABLE public.page_views
  ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_new_visitor BOOLEAN DEFAULT NULL;

-- Vérification
SELECT id, path, session_id, is_new_visitor, created_at FROM public.page_views ORDER BY created_at DESC LIMIT 5;
