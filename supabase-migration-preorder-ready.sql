-- Indique quand l'admin a notifié le client que sa commande est prête à récupérer.
ALTER TABLE public.preorders
ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
