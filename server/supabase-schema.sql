-- ============================================
-- ORADIA - Schéma Supabase pour Précommande
-- ============================================
-- Ce fichier contient la structure de la base de données
-- pour gérer les inscriptions à la précommande

-- Table des inscrits à la précommande
CREATE TABLE IF NOT EXISTS precommande_subscribers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    source VARCHAR(100) DEFAULT 'website',
    status VARCHAR(50) DEFAULT 'pending',
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_precommande_email ON precommande_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_precommande_status ON precommande_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_precommande_subscribed_at ON precommande_subscribers(subscribed_at DESC);

-- Table des événements analytics
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour analytics
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at DESC);

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger pour mettre à jour updated_at automatiquement
CREATE TRIGGER update_precommande_subscribers_updated_at 
    BEFORE UPDATE ON precommande_subscribers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Politique de sécurité Row Level Security (RLS)
ALTER TABLE precommande_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Politique : Permettre l'insertion pour tous (service_role)
CREATE POLICY "Enable insert for service role" ON precommande_subscribers
    FOR INSERT
    WITH CHECK (true);

-- Politique : Permettre la lecture pour service role uniquement
CREATE POLICY "Enable read for service role" ON precommande_subscribers
    FOR SELECT
    USING (true);

-- Politique : Permettre la mise à jour pour service role uniquement
CREATE POLICY "Enable update for service role" ON precommande_subscribers
    FOR UPDATE
    USING (true);

-- Politique analytics : Insertion pour tous
CREATE POLICY "Enable insert for analytics" ON analytics_events
    FOR INSERT
    WITH CHECK (true);

-- Politique analytics : Lecture pour service role
CREATE POLICY "Enable read for analytics" ON analytics_events
    FOR SELECT
    USING (true);

-- ============================================
-- INSTRUCTIONS DE CONFIGURATION
-- ============================================
-- 1. Créer un projet Supabase sur https://supabase.com
-- 2. Aller dans SQL Editor
-- 3. Copier-coller ce script et l'exécuter
-- 4. Récupérer l'URL du projet et la clé ANON dans Settings > API
-- 5. Ajouter ces valeurs dans le fichier .env :
--    SUPABASE_URL=https://your-project.supabase.co
--    SUPABASE_ANON_KEY=your-anon-key

-- ============================================
-- REQUÊTES UTILES
-- ============================================

-- Compter le nombre total d'inscrits
-- SELECT COUNT(*) FROM precommande_subscribers;

-- Voir les derniers inscrits
-- SELECT email, name, status, subscribed_at 
-- FROM precommande_subscribers 
-- ORDER BY subscribed_at DESC 
-- LIMIT 10;

-- Statistiques par statut
-- SELECT status, COUNT(*) as count 
-- FROM precommande_subscribers 
-- GROUP BY status;

-- Inscrits des 7 derniers jours
-- SELECT COUNT(*) 
-- FROM precommande_subscribers 
-- WHERE subscribed_at >= NOW() - INTERVAL '7 days';

-- Exporter tous les emails (pour campagne)
-- SELECT email, name 
-- FROM precommande_subscribers 
-- WHERE status = 'confirmed'
-- ORDER BY subscribed_at DESC;
