-- Schema Supabase complet pour ORADIA
-- Gère tous les types de paiements via un seul webhook

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table des utilisateurs (auth géré par Supabase)
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des crédits Traversée
CREATE TABLE IF NOT EXISTS credits (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    credits INTEGER DEFAULT 0,
    total_purchased INTEGER DEFAULT 0,
    last_purchase TIMESTAMP WITH TIME ZONE,
    purchase_history JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des abonnements Tore
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending', -- pending, active, past_due, cancelled
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    access_code TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des précommandes (existe déjà)
CREATE TABLE IF NOT EXISTS preorders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    stripe_session_id TEXT UNIQUE NOT NULL,
    payment_intent_id TEXT,
    email TEXT NOT NULL,
    full_name TEXT,
    offer TEXT NOT NULL,
    amount_total DECIMAL(10,2),
    currency TEXT DEFAULT 'EUR',
    paid_status TEXT DEFAULT 'pending',
    
    -- Adresse livraison
    shipping_address TEXT,
    address_complement TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT DEFAULT 'FR',
    phone TEXT,
    
    -- Livraison
    shipping_method TEXT, -- home, relay, hand_delivery
    shipping_price_cents INTEGER,
    shipping_provider TEXT,
    
    -- Point relais
    relay_id TEXT,
    relay_name TEXT,
    relay_address1 TEXT,
    relay_address2 TEXT,
    relay_postal_code TEXT,
    relay_city TEXT,
    relay_country TEXT,
    
    email_sent_at TIMESTAMP WITH TIME ZONE,
    stripe_invoice_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des dons (existe déjà)
CREATE TABLE IF NOT EXISTS donors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    stripe_session_id TEXT UNIQUE NOT NULL,
    payment_intent_id TEXT,
    email TEXT,
    full_name TEXT,
    offer TEXT,
    amount_total DECIMAL(10,2),
    currency TEXT DEFAULT 'EUR',
    paid_status TEXT DEFAULT 'pending',
    source TEXT DEFAULT 'oradia-contribution',
    country TEXT DEFAULT 'FR',
    email_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_preorders_session_id ON preorders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_donors_session_id ON donors(stripe_session_id);

-- RLS (Row Level Security) pour la sécurité
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;

-- Politiques RLS (à adapter selon vos besoins)
-- Users peuvent voir leurs propres données
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can view own credits" ON credits
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can view own subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Admin peut tout voir (via service role key)
CREATE POLICY "Admin full access users" ON users
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin full access credits" ON credits
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin full access subscriptions" ON subscriptions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin full access preorders" ON preorders
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin full access donors" ON donors
    FOR ALL USING (auth.role() = 'service_role');

-- Fonctions pour le webhook
CREATE OR REPLACE FUNCTION handle_stripe_webhook()
RETURNS TRIGGER AS $$
BEGIN
    -- Cette fonction peut être utilisée pour des triggers si nécessaire
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
