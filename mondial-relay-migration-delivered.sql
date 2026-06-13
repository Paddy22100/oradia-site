-- Migration Supabase : ajout du statut "delivered" pour clôturer les commandes
-- À exécuter dans la table preorders (suite de mondial-relay-migration.sql)

ALTER TABLE preorders
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE preorders
DROP CONSTRAINT IF EXISTS check_shipping_status;

ALTER TABLE preorders
ADD CONSTRAINT check_shipping_status
CHECK (shipping_status IN ('pending', 'pending_label', 'label_created', 'shipped', 'delivered', 'not_required'));

COMMENT ON COLUMN preorders.delivered_at IS 'Date/heure à laquelle la commande a été marquée comme livrée';
