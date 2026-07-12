-- Migration : ajout colonne relance_sent_at dans preorders
-- À exécuter dans Supabase > SQL Editor

ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS relance_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Vérification
SELECT id, email, paid_status, relance_sent_at FROM public.preorders ORDER BY created_at DESC LIMIT 10;
