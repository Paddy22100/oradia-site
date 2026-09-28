-- ============================================================
-- Grille tarifaire revendeurs + accord commercial par partenaire
-- ============================================================
-- Grille de référence (une seule ligne, id=1) : prix public et remises,
-- modifiables depuis l'onglet Partenaires du dashboard. Les prix par palier
-- (27,30€, 25,20€...) sont calculés à l'affichage à partir de ces valeurs,
-- jamais stockés en dur, pour rester cohérents si le prix public change.
CREATE TABLE IF NOT EXISTS reseller_pricing_settings (
  id integer PRIMARY KEY DEFAULT 1,
  prix_public numeric(10,2) NOT NULL DEFAULT 42.00,
  remise_3ex_pct numeric(5,2) NOT NULL DEFAULT 35,
  remise_10ex_pct numeric(5,2) NOT NULL DEFAULT 40,
  commission_depot_pct numeric(5,2) NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseller_pricing_settings_singleton CHECK (id = 1)
);
INSERT INTO reseller_pricing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE reseller_pricing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reseller_pricing_settings_service_role ON reseller_pricing_settings;
CREATE POLICY reseller_pricing_settings_service_role ON reseller_pricing_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Accord commercial par partenaire (onglet Partenaires) : quel palier de la
-- grille ci-dessus s'applique à ce magasin, ou un prix négocié à part.
ALTER TABLE retail_partners
  ADD COLUMN IF NOT EXISTS pricing_tier text NOT NULL DEFAULT 'a_definir',
  ADD COLUMN IF NOT EXISTS custom_price numeric(10,2);

ALTER TABLE retail_partners DROP CONSTRAINT IF EXISTS retail_partners_pricing_tier_check;
ALTER TABLE retail_partners ADD CONSTRAINT retail_partners_pricing_tier_check
  CHECK (pricing_tier IN ('a_definir', '3_exemplaires', '10_exemplaires', 'depot_vente', 'personnalise'));
