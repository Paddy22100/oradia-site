const { createClient } = require('@supabase/supabase-js');

function getStripeClient() {
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

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

    const { email, fullName } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email invalide' });
    }

    const priceId = process.env.STRIPE_TORE_PRICE_ID;
    if (!priceId) return res.status(500).json({ error: 'STRIPE_TORE_PRICE_ID non configuré' });

    try {
        const stripe = getStripeClient();
        const frontendUrl = process.env.FRONTEND_URL || 'https://oradia.fr';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: email,
            success_url: `${frontendUrl}/member/abonnements.html?subscribed=1`,
            cancel_url:  `${frontendUrl}/member/abonnements.html?cancelled=1`,
            metadata: {
                offer:     'tore-subscription',
                email:     email,
                full_name: fullName || ''
            },
            subscription_data: {
                metadata: { email, full_name: fullName || '', offer: 'tore-subscription' }
            }
        });

        return res.json({ success: true, url: session.url });

    } catch (err) {
        console.error('create-tore-subscription error:', err.message);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
};
