-- Ajouter les colonnes de suivi d'expédition à la table preorders
-- À exécuter dans Supabase SQL Editor

-- Ajouter les colonnes si elles n'existent pas
ALTER TABLE preorders 
ADD COLUMN IF NOT EXISTS tracking_number TEXT,
ADD COLUMN IF NOT EXISTS shipment_number TEXT,
ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

-- Créer un index sur tracking_number pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_preorders_tracking ON preorders(tracking_number);

-- Créer un index sur shipping_status pour filtrage
CREATE INDEX IF NOT EXISTS idx_preorders_shipping_status ON preorders(shipping_status);

-- Créer un index sur shipped_at pour tri chronologique
CREATE INDEX IF NOT EXISTS idx_preorders_shipped_at ON preorders(shipped_at);

-- Vérifier la structure finale
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'preorders'
  AND column_name IN ('tracking_number', 'shipment_number', 'shipped_at', 'shipping_status')
ORDER BY ordinal_position;
