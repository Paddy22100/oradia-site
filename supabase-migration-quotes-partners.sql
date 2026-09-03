-- ============================================================
-- MIGRATION : manufacturing_quotes + retail_partners
-- ============================================================
-- Deux nouveaux onglets admin :
--   - "Devis & Coûts" : devis de fabrication en gros (imprimeurs/fabricants)
--   - "Partenaires" : magasins susceptibles de vendre l'Oracle physique
-- Données internes admin uniquement, jamais exposées côté public ou membre.
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS manufacturing_quotes (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    supplier_name     TEXT NOT NULL,           -- nom du fabricant/imprimeur
    contact_info      TEXT,                    -- email/téléphone/contact chez le fournisseur

    quantity          INTEGER,                 -- quantité de ce devis
    unit_cost_eur     NUMERIC(10,2),            -- coût unitaire hors frais annexes
    shipping_cost_eur NUMERIC(10,2),            -- transport/douane pour cette quantité
    total_cost_eur    NUMERIC(10,2),            -- coût total (calculable, mais gardé en saisie libre)

    quote_date        DATE,                    -- date du devis reçu
    valid_until        DATE,                    -- date de validité du devis

    status            TEXT DEFAULT 'a_etudier'
                        CHECK (status IN ('a_etudier', 'accepte', 'refuse', 'archive')),

    file_url          TEXT,                    -- lien externe vers le PDF du devis, si stocké ailleurs
    notes             TEXT,

    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manufacturing_quotes_status ON manufacturing_quotes(status);
CREATE INDEX IF NOT EXISTS idx_manufacturing_quotes_date   ON manufacturing_quotes(quote_date DESC);

ALTER TABLE manufacturing_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manufacturing_quotes_service_role" ON manufacturing_quotes;
CREATE POLICY "manufacturing_quotes_service_role" ON manufacturing_quotes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE manufacturing_quotes IS
    'Devis de fabrication en gros de l''Oracle (imprimeurs/fabricants), gérés depuis le dashboard admin, onglet Devis & Coûts.';


-- ============================================================
-- AJOUT : catégorie (fabrication vs expédition) — à exécuter même si
-- la table manufacturing_quotes existe déjà (idempotent).
-- ============================================================
ALTER TABLE manufacturing_quotes
    ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'fabrication'
        CHECK (category IN ('fabrication', 'expedition'));

CREATE INDEX IF NOT EXISTS idx_manufacturing_quotes_category ON manufacturing_quotes(category);


CREATE TABLE IF NOT EXISTS retail_partners (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    store_name        TEXT NOT NULL,
    contact_name      TEXT,
    email             TEXT,
    phone             TEXT,
    address           TEXT,
    city              TEXT,

    status            TEXT DEFAULT 'a_contacter'
                        CHECK (status IN ('a_contacter', 'contacte', 'interesse', 'vend', 'refuse')),

    last_contact_date DATE,
    notes             TEXT,

    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_partners_status ON retail_partners(status);
CREATE INDEX IF NOT EXISTS idx_retail_partners_city   ON retail_partners(city);

ALTER TABLE retail_partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "retail_partners_service_role" ON retail_partners;
CREATE POLICY "retail_partners_service_role" ON retail_partners
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE retail_partners IS
    'Magasins/partenaires potentiels pour la vente physique de l''Oracle, gérés depuis le dashboard admin, onglet Partenaires.';
