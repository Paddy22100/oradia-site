-- Trace des acceptations juridiques (CGV, renonciation / exécution immédiate).
-- À exécuter AVANT mise en ligne de la branche legal/conformite-2026-11.
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  kind         text NOT NULL,           -- 'guidance' | 'tore-renunciation'
  email        text,
  cgv_version  text NOT NULL,           -- date de la version des CGV acceptée
  ip           text,
  user_agent   text,
  extra        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS legal_acceptances_email_idx ON public.legal_acceptances (lower(email));
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;  -- accès service_role uniquement
