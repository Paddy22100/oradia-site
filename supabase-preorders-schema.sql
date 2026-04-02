-- ========================================
-- TABLE PREORDERS - ORADIA
-- ========================================
-- Structure de référence pour la table Supabase
-- Compatible avec le webhook Stripe corrigé

-- Création de la table
CREATE TABLE IF NOT EXISTS preorders (
    -- Clé primaire
    id SERIAL PRIMARY KEY,
    
    -- Champ unique pour éviter les doublons (important pour upsert)
    stripe_session_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Informations client (obligatoires)
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    
    -- Détails de la commande
    offer VARCHAR(100) NOT NULL,  -- 'standard', 'guidance-incluse', 'edition-signature'
    amount_total DECIMAL(10,2) NOT NULL,  -- Montant en euros
    currency VARCHAR(3) DEFAULT 'eur',
    
    -- Informations Stripe
    payment_intent_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    paid_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'completed', 'failed'
    
    -- Adresse de livraison
    shipping_address TEXT,
    postal_code VARCHAR(20),
    city VARCHAR(100),
    phone VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    email_sent_at TIMESTAMP WITH TIME ZONE,  -- NULL si email non envoyé
    
    -- Contraintes
    CONSTRAINT preorders_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT preorders_amount_check CHECK (amount_total >= 0),
    CONSTRAINT preorders_currency_check CHECK (currency = 'eur'),
    CONSTRAINT preorders_status_check CHECK (paid_status IN ('pending', 'completed', 'failed'))
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_preorders_stripe_session_id ON preorders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_preorders_email ON preorders(email);
CREATE INDEX IF NOT EXISTS idx_preorders_paid_status ON preorders(paid_status);
CREATE INDEX IF NOT EXISTS idx_preorders_created_at ON preorders(created_at);
CREATE INDEX IF NOT EXISTS idx_preorders_email_sent_at ON preorders(email_sent_at);

-- Trigger pour mettre à jour updated_at automatiquement
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

-- Politique RLS (Row Level Security) - Optionnel mais recommandé
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre les lectures/écritures depuis le service role
CREATE POLICY "Allow all operations for service role" ON preorders
    FOR ALL USING (auth.role() = 'service_role');

-- Commentaires pour documentation
COMMENT ON TABLE preorders IS 'Table des précommandes ORADIA - synchronisation avec Stripe webhook';
COMMENT ON COLUMN preorders.stripe_session_id IS 'ID unique de session Stripe - clé pour upsert idempotent';
COMMENT ON COLUMN preorders.offer IS 'Type d''offre: standard, guidance-incluse, edition-signature';
COMMENT ON COLUMN preorders.paid_status IS 'Statut: pending, completed, failed';
COMMENT ON COLUMN preorders.email_sent_at IS 'Timestamp d''envoi email - NULL si non envoyé';

-- Requêtes utiles pour debugging
-- SELECT * FROM preorders WHERE paid_status = 'completed' ORDER BY created_at DESC;
-- SELECT COUNT(*) as total_orders FROM preorders WHERE paid_status = 'completed';
-- SELECT * FROM preorders WHERE email_sent_at IS NULL AND paid_status = 'completed';
