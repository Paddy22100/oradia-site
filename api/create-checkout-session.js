const { createClient } = require('@supabase/supabase-js');

// Variables d'environnement avec fallbacks
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Création directe du client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Validation des variables d'environnement critiques
function validateEnvironment() {
    const requiredVars = [
        'STRIPE_SECRET_KEY', 
        'SUPABASE_URL', 
        'SUPABASE_SERVICE_ROLE_KEY', 
        'PREORDER_GOAL'
    ];
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        console.error('Variables d\'environnement manquantes:', missing);
        throw new Error(`Configuration error: Missing ${missing.join(', ')}`);
    }
    
    // Validation spécifique pour Stripe
    const stripeKey = process.env.STRIPE_SECRET_KEY;
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
function setCORS(req, res) {
    const allowedOrigins = [
        'https://oradia.fr', 
        'https://www.oradia.fr',
        'https://oradia-site-trail.vercel.app',
        'https://oradia.vercel.app'
    ];
    const origin = req.headers?.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
}

module.exports = async (req, res) => {
    try {
        setCORS(req, res);
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Validation environnement au début
        validateEnvironment();
        
        console.log('Creating checkout session...');
        
        // Handle don-libre case separately
        if (req.body.type === 'don-libre') {
            // Validate minimum amount (20€ = 2000 centimes)
            if (!req.body.customAmount || req.body.customAmount < 2000) {
                return res.status(400).json({ 
                    error: 'Minimum amount is 20€' 
                });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: 'Contribution libre Oradia',
                            },
                            unit_amount: req.body.customAmount,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${process.env.FRONTEND_URL}/success-contribution.html`,
                cancel_url: `${process.env.FRONTEND_URL}/precommande-oracle.html#contribution-libre`,
            });

            return res.json({ url: session.url });
        }

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

        // Créer la session Stripe Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: 'Oracle ORADIA — Le Voyage intérieur',
                        description: 'Un outil de guidance pour éclairer ton chemin, comprendre ce que tu vis, et avancer avec clarté.',
                        images: ['https://oradia.fr/images/medias/apercu_stripe.jpg']
                    },
                    unit_amount: selectedOffer.price,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://oradia.fr/success-precommande.html?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://oradia.fr/precommande-oracle.html',
            custom_text: {
              submit: {
                message: '✨ Merci pour ta confiance — ton voyage commence ici.'
              }
            },
            customer_email: email.trim(),
            metadata: {
                offer,
                full_name: fullName.trim(),
                shipping_address: shippingAddress.trim(),
                postal_code: postalCode.trim(),
                city: city.trim(),
                source: 'oradia-precommande'
            },
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
