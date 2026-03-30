const supabase = require('./lib/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Validation des variables d'environnement critiques
function validateEnvironment() {
    const requiredVars = [
        'STRIPE_SECRET_KEY', 
        'NEXT_PUBLIC_SUPABASE_URL', 
        'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
        'SUPABASE_SERVICE_ROLE_KEY', 
        'PREORDER_GOAL'
    ];
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        console.error('❌ Variables d\'environnement manquantes:', missing);
        throw new Error(`Configuration error: Missing ${missing.join(', ')}`);
    }
    
    // LOG TEMPORAIRE: Détection environnement
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    console.log('🔍 Stripe secret key prefix:', stripeKey ? stripeKey.substring(0, 7) : 'undefined');
    console.log('🔍 Environment:', process.env.NODE_ENV || 'development');
    
    // Validation spécifique pour Stripe
    if (!stripeKey || !stripeKey.startsWith('sk_')) {
        throw new Error('Invalid STRIPE_SECRET_KEY format');
    }
}

// Validation helper
function validateInput(data) {
    const errors = [];
    
    if (!data.offer || !['standard', 'tirage-offert', 'edition-signature'].includes(data.offer)) {
        errors.push('Offre invalide');
    }
    
    if (!data.fullName || data.fullName.trim().length < 2) {
        errors.push('Nom complet requis (min 2 caractères)');
    }
    
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push('Email invalide');
    }
    
    if (!data.shippingAddress || data.shippingAddress.trim().length < 5) {
        errors.push('Adresse requise (min 5 caractères)');
    }
    
    if (!data.postalCode || !/^\d{5}$/.test(data.postalCode)) {
        errors.push('Code postal invalide (5 chiffres requis)');
    }
    
    if (!data.city || data.city.trim().length < 2) {
        errors.push('Ville requise (min 2 caractères)');
    }
    
    return errors;
}

// CORS helper
function setCORS(res) {
    const allowedOrigins = [
        'https://oradia.fr', 
        'https://www.oradia.fr',
        'https://oradia-site-trail.vercel.app',
        'https://oradia.vercel.app'
    ];
    const origin = res.req?.headers?.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
}

module.exports = async (req, res) => {
    try {
        setCORS(res);
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Validation environnement au début
        validateEnvironment();
        
        console.log('=== CHECKOUT SESSION API START ===');
        console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
        console.log('Creating checkout session...');
        
        const { offer, fullName, email, shippingAddress, postalCode, city } = req.body;
        console.log('Request data:', { offer, fullName, email, shippingAddress, postalCode, city });
        
        // Validation stricte
        const validationErrors = validateInput({ offer, fullName, email, shippingAddress, postalCode, city });
        if (validationErrors.length > 0) {
            console.error('Validation errors:', validationErrors);
            return res.status(400).json({ 
                success: false,
                error: 'Validation failed', 
                details: validationErrors 
            });
        }

        // Définir les offres (prix en centimes)
        const offers = {
            'standard': { price: 3800, name: 'Standard - Oracle Oradia' },
            'tirage-offert': { price: 4400, name: 'Tirage Offert - Oracle Oradia' },
            'edition-signature': { price: 5200, name: 'Édition Signature - Oracle Oradia' }
        };

        const selectedOffer = offers[offer];
        if (!selectedOffer) {
            console.error('Invalid offer:', offer);
            return res.status(400).json({ 
                success: false,
                error: 'Invalid offer' 
            });
        }

        // URL de base robuste
        const baseUrl = process.env.FRONTEND_URL || req.headers.origin || 'https://oradia.fr';
        console.log(`Using base URL: ${baseUrl}`);

        // Créer la session Stripe Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: selectedOffer.name,
                        description: `Précommande ORADIA - ${selectedOffer.name}`,
                        images: ['https://oradia.fr/images/oracle-precommande.jpg']
                    },
                    unit_amount: selectedOffer.price,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${baseUrl}/success-precommande.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/precommande-oracle.html?cancelled=true`,
            metadata: {
                offer,
                full_name: fullName.trim(),
                shipping_address: shippingAddress.trim(),
                postal_code: postalCode.trim(),
                city: city.trim(),
                source: 'oradia-precommande'
            },
            customer_email: email.trim(),
        });

        console.log(`Stripe session created: ${session.id}`);

        // Enregistrer la commande pending en base
        const orderData = {
            stripe_session_id: session.id,
            email: email.trim(),
            offer,
            amount_total: selectedOffer.price,
            currency: 'eur',
            full_name: fullName.trim(),
            shipping_address: shippingAddress.trim(),
            postal_code: postalCode.trim(),
            city: city.trim(),
            paid_status: 'pending',
            source: 'oradia-precommande'
        };

        const { error: insertError } = await supabase
            .from('preorders')
            .insert(orderData);

        if (insertError) {
            console.error('Failed to insert pending order:', insertError);
            // Continuer quand même - le webhook créera l'enregistrement si besoin
        } else {
            console.log(`Pending order created: ${session.id}`);
        }

        res.json({ 
            success: true,
            sessionId: session.id
        });

    } catch (error) {
        console.error('Checkout session creation failed:', error);
        
        // Toujours renvoyer du JSON, même en cas d'erreur
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: error.message || 'Failed to create checkout session'
        });
    }
};
