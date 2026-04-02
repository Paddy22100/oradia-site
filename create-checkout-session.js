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

// Validation helper - supporte ancien et nouveau format
function validateInput(data) {
    const errors = [];
    
    // Normalisation des données (support ancien et nouveau format)
    const normalizedData = {
        items: data.items || [],
        fullName: data.customerInfo?.fullName || data.fullName || '',
        email: data.customerInfo?.email || data.email || '',
        shippingAddress: data.customerInfo?.shippingAddress || data.shippingAddress || '',
        postalCode: data.customerInfo?.postalCode || data.postalCode || '',
        city: data.customerInfo?.city || data.city || '',
        phone: data.customerInfo?.phone || data.phone || '',
        country: data.customerInfo?.country || data.country || 'FR',
        addressComplement: data.customerInfo?.addressComplement || data.addressComplement || '',
        deliveryMethod: data.delivery?.method || data.shippingMethod || null,
        deliveryPrice: data.delivery?.price ?? data.shippingPrice ?? 0
    };
    
    // Logs de diagnostic
    console.log('=== DIAGNOSTIC BACKEND ===');
    console.log('Body reçu:', JSON.stringify(data, null, 2));
    console.log('Données normalisées:', JSON.stringify(normalizedData, null, 2));
    
    // Validation des items
    if (!normalizedData.items || !Array.isArray(normalizedData.items) || normalizedData.items.length === 0) {
        errors.push('Panier vide invalide');
    } else {
        // Liste des offres autorisées
        const allowedOffers = ['standard', 'guidance-incluse', 'edition-signature'];
        
        for (const item of normalizedData.items) {
            if (!item.offer || !allowedOffers.includes(item.offer)) {
                errors.push(`Offre invalide: ${item.offer}`);
            }
            if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
                errors.push(`Quantité invalide pour l'offre: ${item.offer}`);
            }
        }
    }
    
    // Validation du client
    if (!normalizedData.fullName || normalizedData.fullName.trim().length < 2) {
        errors.push('Nom complet requis (min 2 caractères)');
    }
    
    if (!normalizedData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedData.email)) {
        errors.push('Email invalide');
    }
    
    // Validation de l'adresse (seulement si livraison != hand_delivery)
    if (normalizedData.deliveryMethod !== 'hand_delivery') {
        if (!normalizedData.shippingAddress || normalizedData.shippingAddress.trim().length < 5) {
            errors.push('Adresse requise (min 5 caractères)');
        }
        
        if (!normalizedData.postalCode || !/^\d{5}$/.test(normalizedData.postalCode)) {
            errors.push('Code postal invalide (5 chiffres requis)');
        }
        
        if (!normalizedData.city || normalizedData.city.trim().length < 2) {
            errors.push('Ville requise (min 2 caractères)');
        }
    }
    
    // Validation de la livraison
    const allowedDeliveryMethods = ['home', 'relay', 'hand_delivery'];
    if (normalizedData.deliveryMethod && !allowedDeliveryMethods.includes(normalizedData.deliveryMethod)) {
        errors.push('Mode de livraison invalide');
    }
    
    console.log('Erreurs de validation:', errors);
    console.log('=== FIN DIAGNOSTIC ===');
    
    return { errors, normalizedData };
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
        
        console.log('=== CHECKOUT SESSION START ===');
        console.log('RAW BODY:', JSON.stringify(req.body, null, 2));
        
        // Handle don-libre case separately
        if (req.body.type === 'don-libre') {
            console.log('DON-LIBRE CASE');
            // Validate minimum amount (20€ = 2000 centimes)
            if (!req.body.customAmount || req.body.customAmount < 2000) {
                console.error('DON-LIBRE ERROR: Amount too low:', req.body.customAmount);
                return res.status(400).json({ 
                    success: false,
                    message: 'Validation failed',
                    errors: ['Minimum amount is 20€']
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

            console.log('DON-LIBRE SESSION CREATED:', session.id);
            return res.json({ url: session.url });
        }

        // Normalisation et validation détaillée
        const validation = validateInput(req.body);
        
        if (validation.errors.length > 0) {
            console.error('=== VALIDATION FAILED ===');
            console.error('ERRORS:', validation.errors);
            console.error('NORMALIZED DATA:', JSON.stringify(validation.normalizedData, null, 2));
            
            return res.status(400).json({ 
                success: false,
                message: 'Validation failed',
                errors: validation.errors,
                normalizedData: {
                    items: validation.normalizedData.items,
                    fullName: validation.normalizedData.fullName,
                    email: validation.normalizedData.email,
                    deliveryMethod: validation.normalizedData.deliveryMethod,
                    deliveryPrice: validation.normalizedData.deliveryPrice
                }
            });
        }

        const { normalizedData } = validation;
        console.log('=== VALIDATION PASSED ===');
        console.log('NORMALIZED DATA:', JSON.stringify(normalizedData, null, 2));

        // Définir les offres (prix en centimes)
        const offers = {
            'standard': { price: 3800, name: 'Standard - Oracle Oradia' },
            'guidance-incluse': { price: 4400, name: 'Guidance Incluse - Oracle Oradia' },
            'edition-signature': { price: 5200, name: 'Édition Signature - Oracle Oradia' }
        };

        // Prix de livraison sécurisés côté serveur
        const DELIVERY_PRICES = {
            'home': 749,      // 7,49€
            'relay': 410,     // 4,10€
            'hand_delivery': 0 // 0,00€
        };

        // Calculer le total et créer les line_items
        let totalAmount = 0;
        const lineItems = [];
        
        console.log('=== BUILDING LINE ITEMS ===');
        
        for (const item of normalizedData.items) {
            const offer = offers[item.offer];
            if (!offer) {
                console.error(`UNKNOWN OFFER: ${item.offer}`);
                return res.status(400).json({ 
                    success: false,
                    message: 'Validation failed',
                    errors: [`Offre inconnue: ${item.offer}`]
                });
            }
            
            const lineItem = {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: offer.name,
                        description: `Quantité: ${item.quantity}`,
                        images: ['https://oradia.fr/images/medias/apercu_stripe.jpg']
                    },
                    unit_amount: offer.price,
                },
                quantity: item.quantity,
            };
            
            lineItems.push(lineItem);
            totalAmount += offer.price * item.quantity;
            
            console.log(`ITEM ADDED: ${offer.name} x${item.quantity} = ${offer.price * item.quantity} centimes`);
        }

        // Sécuriser le prix de livraison - IGNORER TOTALEMENT le prix frontend
        const expectedDeliveryPrice = DELIVERY_PRICES[normalizedData.deliveryMethod] || 0;
        const deliveryPrice = expectedDeliveryPrice; // Utiliser UNIQUEMENT le prix serveur
        
        console.log('DELIVERY PRICE FROM FRONTEND:', normalizedData.deliveryPrice);
        console.log('DELIVERY METHOD:', normalizedData.deliveryMethod);
        console.log('DELIVERY PRICE USED BY SERVER:', deliveryPrice);
        
        // Ajouter les frais de livraison si applicable
        if (normalizedData.deliveryMethod !== 'hand_delivery' && deliveryPrice > 0) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: 'Frais de livraison',
                        description: `Livraison: ${normalizedData.deliveryMethod}`,
                    },
                    unit_amount: deliveryPrice,
                },
                quantity: 1,
            });
            totalAmount += deliveryPrice;
            console.log(`DELIVERY ADDED: ${deliveryPrice} centimes`);
        }

        console.log(`TOTAL AMOUNT: ${totalAmount} centimes (${totalAmount / 100}€)`);
        console.log('FINAL LINE ITEMS:', JSON.stringify(lineItems, null, 2));

        // URL de base robuste
        const baseUrl = process.env.FRONTEND_URL || req.headers.origin || 'https://oradia.fr';

        // Créer la session Stripe Checkout
        console.log('=== CREATING STRIPE SESSION ===');
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: 'https://oradia.fr/success-precommande.html?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://oradia.fr/precommande-oracle.html',
            custom_text: {
              submit: {
                message: '✨ Merci pour ta confiance — ton voyage commence ici.'
              }
            },
            customer_email: normalizedData.email.trim(),
            metadata: {
                items: JSON.stringify(normalizedData.items),
                delivery_method: normalizedData.deliveryMethod,
                full_name: normalizedData.fullName.trim(),
                email: normalizedData.email.trim(),
                phone: normalizedData.phone.trim(),
                shipping_address: normalizedData.shippingAddress?.trim() || '',
                address_complement: normalizedData.addressComplement?.trim() || '',
                postal_code: normalizedData.postalCode?.trim() || '',
                city: normalizedData.city?.trim() || '',
                country: normalizedData.country,
                total_amount: totalAmount,
                delivery_price: deliveryPrice,
                source: 'oradia-livraison'
            },
        });

        console.log(`=== STRIPE SESSION CREATED: ${session.id} ===`);
        console.log('SESSION URL:', session.url);

        // Enregistrer la commande pending en base
        const orderData = {
            stripe_session_id: session.id,
            email: normalizedData.email.trim(),
            items: normalizedData.items,
            amount_total: totalAmount,
            currency: 'eur',
            full_name: normalizedData.fullName.trim(),
            phone: normalizedData.phone.trim(),
            shipping_address: normalizedData.shippingAddress?.trim() || '',
            address_complement: normalizedData.addressComplement?.trim() || '',
            postal_code: normalizedData.postalCode?.trim() || '',
            city: normalizedData.city?.trim() || '',
            country: normalizedData.country,
            delivery_method: normalizedData.deliveryMethod,
            delivery_price: normalizedData.deliveryPrice,
            paid_status: 'pending',
            source: 'oradia-livraison'
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
