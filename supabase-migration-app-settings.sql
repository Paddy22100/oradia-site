-- Réglages modifiables depuis le dashboard admin (valeurs non secrètes).
-- Accès réservé au service_role (RLS activée, aucune policy).
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Mois offert via le QR code du livret : plafond d'essais et seuil d'alerte (%).
INSERT INTO public.app_settings (key, value) VALUES
  ('oracle_trial', '{"max": 1000, "alertPct": 80}'::jsonb)
ON CONFLICT (key) DO NOTHING;
