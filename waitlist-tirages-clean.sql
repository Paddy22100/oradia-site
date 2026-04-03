-- ============================================
-- TABLE WAITLIST TIRAGES - ORADIA
-- Pour les emails des personnes intéressées par les tirages en ligne
-- ============================================

-- Création de la table waitlist_tirages
CREATE TABLE IF NOT EXISTS waitlist_tirages (
    -- Primary key
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Champs principaux
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    
    -- Métadonnées
    source TEXT DEFAULT 'oradia-tirages',
    status TEXT DEFAULT 'active', -- 'active', 'unsubscribed', 'bounced'
    
    -- Synchronisation Brevo
    brevo_synced BOOLEAN DEFAULT FALSE,
    brevo_synced_at TIMESTAMP WITH TIME ZONE,
    brevo_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Métadonnées additionnelles
    metadata JSONB DEFAULT '{}',
    
    -- Contraintes
    CONSTRAINT waitlist_tirages_email_unique UNIQUE (email),
    CONSTRAINT waitlist_tirages_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT waitlist_tirages_status_check CHECK (status IN ('active', 'unsubscribed', 'bounced'))
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_waitlist_tirages_email ON waitlist_tirages(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_tirages_status ON waitlist_tirages(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_tirages_brevo_synced ON waitlist_tirages(brevo_synced);
CREATE INDEX IF NOT EXISTS idx_waitlist_tirages_created_at ON waitlist_tirages(created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_tirages_source ON waitlist_tirages(source);

-- Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_waitlist_tirages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER waitlist_tirages_updated_at
    BEFORE UPDATE ON waitlist_tirages
    FOR EACH ROW
    EXECUTE FUNCTION update_waitlist_tirages_updated_at();

-- Vue pour les statistiques de la waitlist
CREATE OR REPLACE VIEW waitlist_tirages_stats AS
SELECT 
    COUNT(*) as total_subscribers,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscribers,
    COUNT(CASE WHEN status = 'unsubscribed' THEN 1 END) as unsubscribed,
    COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced,
    COUNT(CASE WHEN brevo_synced = true THEN 1 END) as brevo_synced_count,
    COUNT(CASE WHEN brevo_synced = false THEN 1 END) as brevo_not_synced_count,
    ROUND(
        (COUNT(CASE WHEN brevo_synced = true THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)), 
        2
    ) as brevo_sync_percentage,
    MIN(created_at) as first_subscription,
    MAX(created_at) as last_subscription,
    MIN(brevo_synced_at) as first_brevo_sync,
    MAX(brevo_synced_at) as last_brevo_sync
FROM waitlist_tirages;
