-- ============================================================
-- MIGRATION : factures jointes aux transactions (Comptabilité > Recettes & dépenses)
-- ============================================================
-- Permet de joindre un ou plusieurs fichiers de facture à une transaction et
-- de les consulter/télécharger depuis le dashboard admin. Même mécanique que
-- supplier_files (Contacts > Fournisseurs), avec une différence volontaire :
-- bucket PRIVÉ (pas de lecture publique) car une facture peut contenir des
-- informations sensibles (SIRET, IBAN, adresse) — l'accès passe uniquement
-- par une URL signée à courte durée, générée à la demande par l'API admin.
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

-- Bucket privé pour les fichiers de facture
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'transaction-invoices',
  'transaction-invoices',
  false,
  15728640,  -- 15 Mo max par fichier
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Le service_role (fonctions serverless admin) peut tout faire sur ce bucket.
-- Pas de politique de lecture publique : le bucket étant privé, un accès
-- direct par URL publique échoue de toute façon ; l'API admin passe par
-- createSignedUrl() pour générer un lien de téléchargement temporaire.
CREATE POLICY "service_role full access transaction-invoices"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'transaction-invoices')
WITH CHECK (bucket_id = 'transaction-invoices');

CREATE TABLE IF NOT EXISTS transaction_invoices (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    file_name      TEXT NOT NULL,       -- nom d'origine, affiché à l'écran
    storage_path   TEXT NOT NULL,       -- chemin dans le bucket Storage, pour suppression/téléchargement
    file_size      INTEGER,
    uploaded_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_invoices_transaction ON transaction_invoices(transaction_id, uploaded_at DESC);

ALTER TABLE transaction_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transaction_invoices_service_role" ON transaction_invoices;
CREATE POLICY "transaction_invoices_service_role" ON transaction_invoices
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE transaction_invoices IS
    'Factures jointes à une transaction (Comptabilité > Recettes & dépenses), gérées depuis le dashboard admin. Fichiers stockés dans le bucket privé transaction-invoices, téléchargés via URL signée.';

-- Vérification
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'transaction-invoices';
