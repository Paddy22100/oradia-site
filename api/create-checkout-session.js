const supabase = require('../lib/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const origin = res.req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
    setCORS(res);
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { offer, fullName, email, shippingAddress, postalCode, city } = req.body;
        
        // Validation stricte
        const validationErrors = validateInput({ offer, fullName, email, shippingAddress, postalCode, city });
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: validationErrors 
            });
        }

        // Définir les offres
        const offers = {
            'standard': { price: 3800, name: 'Standard - Oracle Oradia' },
            'tirage-offert': { price: 4400, name: 'Tirage Offert - Oracle Oradia' },
            'edition-signature': { price: 5200, name: 'Édition Signature - Oracle Oradia' }
        };

        const selectedOffer = offers[offer];
        if (!selectedOffer) {
            return res.status(400).json({ error: 'Invalid offer' });
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
            sessionId: session.id,
            success: true 
        });

    } catch (error) {
        console.error('Checkout session creation failed:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'Failed to create checkout session'
        });
    }
};
