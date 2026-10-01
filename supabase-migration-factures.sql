-- ============================================================
-- MIGRATION : module Factures (devis, factures, clients, livre des recettes)
-- ============================================================
-- Permet d'éditer, d'envoyer et de suivre ses factures depuis le dashboard admin,
-- et de tenir le livre des recettes obligatoire en micro-entreprise.
--
-- PRINCIPE CENTRAL — UNE FACTURE N'EST PAS UNE RECETTE
-- La micro-entreprise se déclare sur l'encaissé. Une facture naît en brouillon,
-- passe à « envoyée », et ne devient une ligne de chiffre d'affaires (table
-- `transactions`) qu'au moment où elle est marquée payée, à la DATE DU PAIEMENT —
-- jamais à la date d'émission. C'est ce garde-fou qui empêche de déclarer en août
-- une facture émise le 26 août et encaissée en septembre.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Clients
-- ------------------------------------------------------------
-- `siret` sert à distinguer un client professionnel d'un particulier : à partir du
-- 1er septembre 2027, une facture B2B devra transiter par une plateforme agréée,
-- alors qu'une facture à un particulier reste un PDF ordinaire (e-reporting à part).
-- Le champ reste facultatif ; il sert d'alerte, pas de blocage.
CREATE TABLE IF NOT EXISTS clients (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nom          TEXT NOT NULL,
    adresse      TEXT,
    code_postal  TEXT,
    ville        TEXT,
    pays         TEXT DEFAULT 'France',
    email        TEXT,
    telephone    TEXT,
    siret        TEXT,
    notes        TEXT,
    archived     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients(nom);

-- ------------------------------------------------------------
-- 2. Numérotation — continue et sans trou, par série
-- ------------------------------------------------------------
-- L'obligation légale est une numérotation chronologique continue. Elle ne peut pas
-- dépendre d'un MAX() côté application : deux créations simultanées produiraient le
-- même numéro. La fonction ci-dessous incrémente atomiquement (UPDATE … RETURNING).
--
-- La série F01 reprend la numérotation des factures déjà émises sous Word
-- (F01-00001 du 26/08/2026, F01-00002 du 30/09/2026) : le compteur démarre donc à 2,
-- et la prochaine facture émise depuis le dashboard sera F01-00003.
CREATE TABLE IF NOT EXISTS facture_sequences (
    serie        TEXT PRIMARY KEY,
    last_number  INTEGER NOT NULL DEFAULT 0,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO facture_sequences (serie, last_number) VALUES ('F01', 2)
ON CONFLICT (serie) DO NOTHING;
-- Les devis suivent leur propre série : un devis n'est pas une pièce comptable et
-- n'a pas à consommer un numéro de facture.
INSERT INTO facture_sequences (serie, last_number) VALUES ('D01', 0)
ON CONFLICT (serie) DO NOTHING;

CREATE OR REPLACE FUNCTION next_facture_numero(p_serie TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_next INTEGER;
BEGIN
    INSERT INTO facture_sequences (serie, last_number) VALUES (p_serie, 0)
    ON CONFLICT (serie) DO NOTHING;

    UPDATE facture_sequences
       SET last_number = last_number + 1, updated_at = NOW()
     WHERE serie = p_serie
    RETURNING last_number INTO v_next;

    RETURN p_serie || '-' || LPAD(v_next::TEXT, 5, '0');
END;
$$;

COMMENT ON FUNCTION next_facture_numero IS
    'Renvoie le prochain numéro de la série (ex. F01-00003) en incrémentant atomiquement le compteur. Ne jamais numéroter côté application : la continuité est une obligation légale.';

-- ------------------------------------------------------------
-- 3. Factures et devis
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS factures (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    numero            TEXT NOT NULL UNIQUE,
    serie             TEXT NOT NULL DEFAULT 'F01',
    type              TEXT NOT NULL DEFAULT 'facture'
                      CHECK (type IN ('facture', 'devis')),
    statut            TEXT NOT NULL DEFAULT 'brouillon'
                      CHECK (statut IN ('brouillon', 'envoyee', 'payee', 'annulee', 'acceptee', 'refusee')),

    client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
    -- Copie figée des coordonnées du client au moment de l'émission : une facture
    -- envoyée ne doit pas changer rétroactivement si la fiche client est corrigée.
    client_snapshot   JSONB,

    date_emission     DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Calculée depuis date_emission + delai_paiement_jours par l'application : plus
    -- de « 31/09/2026 » recopié à la main sur un mois de trente jours.
    date_echeance     DATE,
    delai_paiement_jours INTEGER NOT NULL DEFAULT 30,
    periode_label     TEXT,              -- ex. « septembre 2026 », affiché sur le PDF
    total_ht          NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- Nature d'activité URSSAF de la facture entière (bnc / bic_ventes /
    -- bic_prestations), reportée sur la transaction au moment de l'encaissement.
    urssaf_category   TEXT NOT NULL DEFAULT 'bic_prestations'
                      CHECK (urssaf_category IN ('bnc', 'bic_ventes', 'bic_prestations')),

    -- PDF archivé dans le bucket privé, réutilisé tel quel pour les relances.
    storage_path      TEXT,
    sent_at           TIMESTAMP WITH TIME ZONE,
    sent_to           TEXT,

    -- Encaissement. `date_paiement` est la date du crédit en banque : c'est elle,
    -- et elle seule, qui détermine le mois de déclaration.
    date_paiement     DATE,
    mode_paiement     TEXT,
    transaction_id    UUID REFERENCES transactions(id) ON DELETE SET NULL,

    relance_count     INTEGER NOT NULL DEFAULT 0,
    last_relance_at   TIMESTAMP WITH TIME ZONE,

    notes             TEXT,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factures_statut   ON factures(statut, date_emission DESC);
CREATE INDEX IF NOT EXISTS idx_factures_client   ON factures(client_id, date_emission DESC);
CREATE INDEX IF NOT EXISTS idx_factures_paiement ON factures(date_paiement);

COMMENT ON COLUMN factures.date_paiement IS
    'Date du crédit en banque. Détermine le mois de déclaration URSSAF — jamais la date d''émission.';

-- Lignes de prestation
CREATE TABLE IF NOT EXISTS facture_lignes (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    facture_id      UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    designation     TEXT NOT NULL,
    date_prestation DATE,
    quantite        NUMERIC(10,2) NOT NULL DEFAULT 1,
    prix_unitaire   NUMERIC(10,2) NOT NULL DEFAULT 0,
    total           NUMERIC(10,2) NOT NULL DEFAULT 0,
    ordre           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_facture_lignes_facture ON facture_lignes(facture_id, ordre);

-- ------------------------------------------------------------
-- 4. Modèles de prestation — pour ne plus retaper les lignes récurrentes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prestation_modeles (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    libelle         TEXT NOT NULL,          -- nom court dans le menu déroulant
    designation     TEXT NOT NULL,          -- texte imprimé sur la facture
    prix_unitaire   NUMERIC(10,2) NOT NULL DEFAULT 0,
    urssaf_category TEXT NOT NULL DEFAULT 'bic_prestations'
                    CHECK (urssaf_category IN ('bnc', 'bic_ventes', 'bic_prestations')),
    ordre           INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO prestation_modeles (libelle, designation, prix_unitaire, urssaf_category, ordre)
SELECT * FROM (VALUES
    ('Entretien gîte',     'ENTRETIEN ET REMISE EN ETAT DU GITE',                 100.00, 'bic_prestations', 1),
    ('Entretien extérieur','Entretien extérieur : abords, terrasse, espaces verts', 60.00, 'bic_prestations', 2)
) AS v(libelle, designation, prix_unitaire, urssaf_category, ordre)
WHERE NOT EXISTS (SELECT 1 FROM prestation_modeles);

-- ------------------------------------------------------------
-- 5. Nature d'activité sur les transactions saisies à la main
-- ------------------------------------------------------------
-- lib/urssaf.js lit déjà cette colonne comme surcharge ; sans elle, toute saisie
-- manuelle retombait sur le défaut « BIC prestations ».
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS urssaf_category TEXT
    CHECK (urssaf_category IN ('bnc', 'bic_ventes', 'bic_prestations'));

COMMENT ON COLUMN transactions.urssaf_category IS
    'Case URSSAF forcée pour cette ligne. NULL = déduite de la source (cf. CATEGORY_BY_SOURCE dans lib/urssaf.js).';

-- Lien retour facture → transaction, pour remonter de la recette à sa pièce.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS facture_id UUID REFERENCES factures(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 6. Stockage des PDF émis
-- ------------------------------------------------------------
-- Bucket privé distinct de `transaction-invoices` (qui accueille les justificatifs
-- reçus) : ici ce sont les pièces émises, qui doivent être conservées dix ans.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('factures-emises', 'factures-emises', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "service_role full access factures-emises" ON storage.objects;
CREATE POLICY "service_role full access factures-emises"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'factures-emises') WITH CHECK (bucket_id = 'factures-emises');

-- ------------------------------------------------------------
-- 7. RLS — service_role uniquement (toutes ces tables sont admin)
-- ------------------------------------------------------------
ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facture_lignes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE facture_sequences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestation_modeles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_service_role"            ON clients;
DROP POLICY IF EXISTS "factures_service_role"           ON factures;
DROP POLICY IF EXISTS "facture_lignes_service_role"     ON facture_lignes;
DROP POLICY IF EXISTS "facture_sequences_service_role"  ON facture_sequences;
DROP POLICY IF EXISTS "prestation_modeles_service_role" ON prestation_modeles;

CREATE POLICY "clients_service_role"            ON clients            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "factures_service_role"           ON factures           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "facture_lignes_service_role"     ON facture_lignes     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "facture_sequences_service_role"  ON facture_sequences  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "prestation_modeles_service_role" ON prestation_modeles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 8. Client déjà connu, pour ne pas le ressaisir
-- ------------------------------------------------------------
INSERT INTO clients (nom, adresse, code_postal, ville)
SELECT 'M. Hervé Stéphane', '31 Heunan', '22100', 'Saint Carné'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE nom = 'M. Hervé Stéphane');

-- ------------------------------------------------------------
-- Vérification
-- ------------------------------------------------------------
SELECT serie, last_number FROM facture_sequences ORDER BY serie;
SELECT libelle, prix_unitaire FROM prestation_modeles ORDER BY ordre;
SELECT nom, ville FROM clients ORDER BY nom;
