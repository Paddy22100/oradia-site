-- ============================================
-- VÉRIFICATION STRUCTURE TABLE PREORDERS
-- ============================================

-- Vérifier si la table preorders existe
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE  table_schema = 'public'
   AND    table_name   = 'preorders'
) as table_exists;

-- Si la table existe, vérifier les colonnes
-- (À exécuter seulement si la table existe)
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'preorders' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Vérifier spécifiquement si stripe_customer_id existe
SELECT EXISTS (
   SELECT FROM information_schema.columns 
   WHERE  table_schema = 'public'
   AND    table_name   = 'preorders'
   AND    column_name  = 'stripe_customer_id'
) as stripe_customer_id_exists;

-- Solution alternative : Ajouter la colonne si elle n'existe pas
ALTER TABLE preorders 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
