-- ============================================
-- TABLE DONORS - ORADIA
-- Pour les dons libres (contribution-libre)
-- ============================================

-- Création de la table donors
CREATE TABLE IF NOT EXISTS donors (
    -- Primary key
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Champs Stripe
    stripe_session_id TEXT UNIQUE NOT NULL,
    payment_intent_id TEXT,
    
    -- Champs client
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    
    -- Champs paiement
    amount_total INTEGER NOT NULL, -- en centimes
    currency TEXT DEFAULT 'eur',
    paid_status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    
    -- Métadonnées
    source TEXT DEFAULT 'oradia-contribution',
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Contraintes
    CONSTRAINT donors_stripe_session_id_unique UNIQUE (stripe_session_id),
    CONSTRAINT donors_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT donors_amount_positive CHECK (amount_total > 0),
    CONSTRAINT donors_paid_status_check CHECK (paid_status IN ('pending', 'completed', 'failed'))
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_donors_stripe_session_id ON donors(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_donors_email ON donors(email);
CREATE INDEX IF NOT EXISTS idx_donors_paid_status ON donors(paid_status);
CREATE INDEX IF NOT EXISTS idx_donors_amount_total ON donors(amount_total);
CREATE INDEX IF NOT EXISTS idx_donors_created_at ON donors(created_at);
CREATE INDEX IF NOT EXISTS idx_donors_source ON donors(source);

-- Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_donors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER donors_updated_at
    BEFORE UPDATE ON donors
    FOR EACH ROW
    EXECUTE FUNCTION update_donors_updated_at();

-- Vue pour les statistiques des dons
CREATE OR REPLACE VIEW donor_stats AS
SELECT 
    COUNT(*) as total_donors,
    COUNT(CASE WHEN paid_status = 'completed' THEN 1 END) as completed_donors,
    SUM(CASE WHEN paid_status = 'completed' THEN amount_total ELSE 0 END) as total_amount_cents,
    ROUND(
        SUM(CASE WHEN paid_status = 'completed' THEN amount_total ELSE 0 END) / 100.0, 
        2
    ) as total_amount_eur,
    AVG(CASE WHEN paid_status = 'completed' THEN amount_total ELSE NULL END) as average_amount_cents,
    ROUND(
        AVG(CASE WHEN paid_status = 'completed' THEN amount_total ELSE NULL END) / 100.0, 
        2
    ) as average_amount_eur,
    MIN(created_at) as first_donation,
    MAX(created_at) as last_donation
FROM donors;
