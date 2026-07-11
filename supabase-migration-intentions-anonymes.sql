-- Table pour stocker les intentions des visiteurs anonymes (non connectés)
-- utilisée par l'analyse éditoriale des insights newsletter.
CREATE TABLE IF NOT EXISTS public.intentions_anonymes (
  id          BIGSERIAL PRIMARY KEY,
  intention   TEXT NOT NULL,
  cartes      TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pas de RLS nécessaire : lecture via service_role uniquement (admin)
-- Pas de données personnelles : intention anonymisée, pas d'email ou d'IP
