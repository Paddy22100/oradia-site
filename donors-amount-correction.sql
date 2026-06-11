-- ============================================
-- CORRECTION AMOUNT_TOTAL DONORS EN EUROS
-- ============================================

-- 1. Convertir la colonne en numeric (si pas déjà fait)
ALTER TABLE donors
ALTER COLUMN amount_total TYPE numeric;

-- 2. Convertir les anciennes valeurs de centimes en euros (UNE SEULE FOIS)
-- Ne lancer que si les anciennes lignes étaient en centimes (>= 1000)
UPDATE donors
SET amount_total = amount_total / 100
WHERE amount_total >= 1000;

-- 3. Vérification
SELECT 
    id, 
    email, 
    amount_total, 
    currency, 
    created_at,
    CASE 
        WHEN amount_total < 1000 THEN 'déjà en euros'
        ELSE 'converti de centimes'
    END as status
FROM donors 
ORDER BY created_at DESC 
LIMIT 10;
