-- ========================================
-- RESET COMPLET TABLE PREORDERS - SUPABASE
-- ========================================
-- Exécuter ce script dans l'éditeur SQL Supabase
-- Il va supprimer et recréer la table avec la structure exacte

-- 1. Supprimer la table existante (si elle existe)
DROP TABLE IF EXISTS preorders CASCADE;

-- 2. Créer la table avec la structure exacte pour le webhook
CREATE TABLE preorders (
    -- Clé primaire
    id SERIAL PRIMARY KEY,
    
    -- Champ unique pour l'upsert (CRITICAL pour onConflict)
    stripe_session_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Informations client
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    
    -- Détails de la commande
    offer VARCHAR(100) NOT NULL,
    amount_total DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'eur',
    
    -- Informations Stripe
    payment_intent_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    paid_status VARCHAR(50) DEFAULT 'pending',
    
    -- Adresse de livraison
    shipping_address TEXT,
    postal_code VARCHAR(20),
    city VARCHAR(100),
    phone VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    email_sent_at TIMESTAMP WITH TIME ZONE
);

-- 3. Créer les index pour optimiser les performances
CREATE INDEX idx_preorders_stripe_session_id ON preorders(stripe_session_id);
CREATE INDEX idx_preorders_email ON preorders(email);
CREATE INDEX idx_preorders_paid_status ON preorders(paid_status);
CREATE INDEX idx_preorders_created_at ON preorders(created_at DESC);
CREATE INDEX idx_preorders_email_sent_at ON preorders(email_sent_at);

-- 4. Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_preorders_updated_at 
    BEFORE UPDATE ON preorders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Contraintes de validation
ALTER TABLE preorders 
    ADD CONSTRAINT preorders_email_check 
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE preorders 
    ADD CONSTRAINT preorders_amount_check 
    CHECK (amount_total >= 0);

ALTER TABLE preorders 
    ADD CONSTRAINT preorders_currency_check 
    CHECK (currency = 'eur');

ALTER TABLE preorders 
    ADD CONSTRAINT preorders_status_check 
    CHECK (paid_status IN ('pending', 'completed', 'failed'));

-- 6. Activer RLS (Row Level Security) - Optionnel mais recommandé
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;

-- 7. Politique RLS pour permettre les opérations depuis le service role
CREATE POLICY "Allow all operations for service role" ON preorders
    FOR ALL USING (auth.role() = 'service_role');

-- 8. Commentaires pour documentation
COMMENT ON TABLE preorders IS 'Table des précommandes ORADIA - synchronisation avec webhook Stripe';
COMMENT ON COLUMN preorders.stripe_session_id IS 'ID unique de session Stripe - clé pour upsert idempotent';
COMMENT ON COLUMN preorders.email IS 'Email client requis pour la commande';
COMMENT ON COLUMN preorders.offer IS 'Type d''offre: standard, guidance-incluse, edition-signature';
COMMENT ON COLUMN preorders.amount_total IS 'Montant total en euros (format décimal)';
COMMENT ON COLUMN preorders.paid_status IS 'Statut: pending, completed, failed';
COMMENT ON COLUMN preorders.email_sent_at IS 'Timestamp d''envoi email - NULL si non envoyé';

-- 9. Test d'insertion pour vérifier que tout fonctionne
INSERT INTO preorders (
    stripe_session_id,
    email,
    offer,
    full_name,
    amount_total,
    currency,
    payment_intent_id,
    stripe_customer_id,
    paid_status,
    shipping_address,
    postal_code,
    city,
    phone
) VALUES (
    'cs_test_verification_' || EXTRACT(EPOCH FROM NOW())::text,
    'test@oradia.fr',
    'test-offer',
    'Test Verification',
    49.99,
    'eur',
    'pi_test_verification',
    null,
    'completed',
    '17 Test Street',
    '22100',
    'TESTVILLE',
    '0612345678'
);

-- 10. Vérification du test
SELECT 
    id,
    stripe_session_id,
    email,
    offer,
    amount_total,
    currency,
    paid_status,
    created_at,
    updated_at
FROM preorders 
WHERE email = 'test@oradia.fr';

-- 11. Nettoyage du test
DELETE FROM preorders WHERE email = 'test@oradia.fr';

-- 12. Confirmation finale
SELECT 'Table preorders créée avec succès' as status,
       COUNT(*) as colonnes
FROM information_schema.columns 
WHERE table_name = 'preorders' 
AND table_schema = 'public';

-- ========================================
-- INSTRUCTIONS POST-EXÉCUTION
-- ========================================
-- Après avoir exécuté ce script:

-- 1. Vérifiez que la table est bien créée:
-- SELECT * FROM preorders LIMIT 0;

-- 2. Vérifiez la contrainte unique:
-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'preorders';

-- 3. Testez le webhook avec un paiement réel

-- 4. Si tout fonctionne, le webhook devrait retourner:
-- supabaseStatus: 'success'
-- emailStatus: 'sent'

-- ========================================
-- DÉBOGAGE SI PROBLÈME PERSISTE
-- ========================================
-- Si l'upsert échoue toujours, vérifiez:

-- A. Variables d'environnement dans Vercel:
--    - SUPABASE_URL
--    - SUPABASE_SERVICE_ROLE_KEY

-- B. Permissions du service role:
--    - Doit avoir tous les droits sur la table preorders

-- C. Logs du webhook pour voir l'erreur exacte
