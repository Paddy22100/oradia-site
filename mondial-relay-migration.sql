-- Migration Supabase pour ajouter les colonnes d'expédition Mondial Relay
-- À exécuter dans la table preorders

-- Ajout des colonnes d'expédition
ALTER TABLE preorders 
ADD COLUMN IF NOT EXISTS shipping_method TEXT,
ADD COLUMN IF NOT EXISTS shipping_price_cents INTEGER,
ADD COLUMN IF NOT EXISTS shipping_provider TEXT,
ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS relay_id TEXT,
ADD COLUMN IF NOT EXISTS relay_name TEXT,
ADD COLUMN IF NOT EXISTS relay_address1 TEXT,
ADD COLUMN IF NOT EXISTS relay_address2 TEXT,
ADD COLUMN IF NOT EXISTS relay_postal_code TEXT,
ADD COLUMN IF NOT EXISTS relay_city TEXT,
ADD COLUMN IF NOT EXISTS relay_country TEXT,
ADD COLUMN IF NOT EXISTS shipment_number TEXT,
ADD COLUMN IF NOT EXISTS tracking_number TEXT,
ADD COLUMN IF NOT EXISTS label_url TEXT,
ADD COLUMN IF NOT EXISTS label_base64 TEXT,
ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

-- Création des index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_preorders_shipping_status ON preorders(shipping_status);
CREATE INDEX IF NOT EXISTS idx_preorders_tracking_number ON preorders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_preorders_relay_id ON preorders(relay_id);
CREATE INDEX IF NOT EXISTS idx_preorders_shipping_method ON preorders(shipping_method);

-- Ajout de contraintes CHECK pour les valeurs valides
ALTER TABLE preorders 
ADD CONSTRAINT IF NOT EXISTS check_shipping_method 
CHECK (shipping_method IN ('home', 'relay', 'hand_delivery') OR shipping_method IS NULL);

ALTER TABLE preorders 
ADD CONSTRAINT IF NOT EXISTS check_shipping_status 
CHECK (shipping_status IN ('pending', 'pending_label', 'label_created', 'shipped', 'not_required'));

-- Ajout de contraintes pour les prix positifs
ALTER TABLE preorders 
ADD CONSTRAINT IF NOT EXISTS check_shipping_price_positive 
CHECK (shipping_price_cents >= 0 OR shipping_price_cents IS NULL);

-- Commentaires pour la documentation
COMMENT ON COLUMN preorders.shipping_method IS 'Méthode de livraison: home, relay, hand_delivery';
COMMENT ON COLUMN preorders.shipping_price_cents IS 'Prix de livraison en centimes';
COMMENT ON COLUMN preorders.shipping_provider IS 'Fournisseur d\'expédition: mondial_relay, etc.';
COMMENT ON COLUMN preorders.shipping_status IS 'Statut: pending, pending_label, label_created, shipped, not_required';
COMMENT ON COLUMN preorders.relay_id IS 'ID du point relais Mondial Relay';
COMMENT ON COLUMN preorders.relay_name IS 'Nom du point relais';
COMMENT ON COLUMN preorders.relay_address1 IS 'Adresse principale du point relais';
COMMENT ON COLUMN preorders.relay_address2 IS 'Complément d\'adresse du point relais';
COMMENT ON COLUMN preorders.relay_postal_code IS 'Code postal du point relais';
COMMENT ON COLUMN preorders.relay_city IS 'Ville du point relais';
COMMENT ON COLUMN preorders.relay_country IS 'Pays du point relais';
COMMENT ON COLUMN preorders.shipment_number IS 'Numéro d\'expédition interne';
COMMENT ON COLUMN preorders.tracking_number IS 'Numéro de suivi du transporteur';
COMMENT ON COLUMN preorders.label_url IS 'URL de l\'étiquette d\'expédition';
COMMENT ON COLUMN preorders.label_base64 IS 'Étiquette en base64 (PDF)';
COMMENT ON COLUMN preorders.shipped_at IS 'Date/heure d\'expédition effective';

-- Mise à jour des données existantes pour les commandes sans expédition (remise en main propre)
UPDATE preorders 
SET shipping_status = 'not_required' 
WHERE shipping_status = 'pending' 
AND (shipping_method IS NULL OR shipping_method = 'hand_delivery');

-- Log de la migration
DO $$
BEGIN
    RAISE NOTICE 'Migration Mondial Relay terminée avec succès';
    RAISE NOTICE 'Colonnes ajoutées: %', COUNT(*);
    RAISE NOTICE 'Index créés: 4';
    RAISE NOTICE 'Contraintes ajoutées: 3';
END $$;
