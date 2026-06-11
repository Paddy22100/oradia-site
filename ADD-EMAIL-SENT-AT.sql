-- Ajouter la colonne email_sent_at pour éviter les doublons d'emails
-- À exécuter dans Supabase SQL Editor

-- Pour la table preorders
ALTER TABLE preorders 
ADD COLUMN IF NOT EXISTS email_sent_at timestamptz NULL;

-- Pour la table donors  
ALTER TABLE donors
ADD COLUMN IF NOT EXISTS email_sent_at timestamptz NULL;

-- Vérification que les colonnes ont été ajoutées
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name IN ('preorders', 'donors') 
  AND column_name = 'email_sent_at'
ORDER BY table_name;
