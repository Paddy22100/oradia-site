const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function setCORS(req, res) {
    const allowed = ['https://oradia.fr', 'https://www.oradia.fr', 'https://oradia.vercel.app'];
    const origin  = req.headers?.origin;
    if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
    setCORS(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

    const { code } = req.body || {};
    if (!code || typeof code !== 'string' || code.trim().length < 4) {
        return res.status(400).json({ valid: false, error: 'Code invalide' });
    }

    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('tore_subscriptions')
            .select('email, status, expires_at')
            .eq('access_code', code.trim().toUpperCase())
            .eq('status', 'active')
            .maybeSingle();

        if (error) {
            console.error('validate-tore-code Supabase error:', error.message);
            return res.status(500).json({ valid: false, error: 'Erreur serveur' });
        }

        if (!data) {
            return res.status(200).json({ valid: false });
        }

        // Vérifier l'expiration
        const now = new Date();
        const expiry = new Date(data.expires_at);
        if (expiry < now) {
            return res.status(200).json({ valid: false, error: 'Code expiré' });
        }

        return res.status(200).json({ valid: true, expiresAt: data.expires_at });

    } catch (err) {
        console.error('validate-tore-code error:', err.message);
        return res.status(500).json({ valid: false, error: 'Erreur serveur' });
    }
};
