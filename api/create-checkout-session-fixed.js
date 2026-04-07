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
    
    // Validation des items
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
        errors.push('Articles requis');
    }
    
    // Validation des infos client
    if (!data.customerInfo) {
        errors.push('Informations client requises');
    } else {
        const customer = data.customerInfo;
        
        if (!customer.fullName || customer.fullName.trim().length < 2) {
            errors.push('Nom complet requis (min 2 caractères)');
        }
        
        if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
            errors.push('Email invalide');
        }
    }
    
    // Validation de la livraison
    if (!data.delivery) {
        errors.push('Informations de livraison requises');
    } else {
        const delivery = data.delivery;
        
        if (!delivery.method || !['home', 'relay', 'hand_delivery'].includes(delivery.method)) {
            errors.push('Méthode de livraison invalide');
        }
        
        if (typeof delivery.price !== 'number' || delivery.price < 0) {
            errors.push('Prix de livraison invalide');
        }
        
        // Validation adresse pour home et relay
        if (delivery.method !== 'hand_delivery') {
            const customer = data.customerInfo;
            
            if (!customer.shippingAddress || customer.shippingAddress.trim().length < 5) {
                errors.push('Adresse requise (min 5 caractères)');
            }
            
            if (!customer.postalCode || !/^\d{5}$/.test(customer.postalCode)) {
                errors.push('Code postal invalide (5 chiffres requis)');
            }
            
            if (!customer.city || customer.city.trim().length < 2) {
                errors.push('Ville requise (min 2 caractères)');
            }
        }
        
        // Validation point relais pour relay
        if (delivery.method === 'relay') {
            if (!data.relayPoint) {
                errors.push('Point relais requis pour la livraison en point relais');
            } else {
                const relay = data.relayPoint;
                
                if (!relay.id || relay.id.trim().length === 0) {
                    errors.push('ID du point relais requis');
                }
                
                if (!relay.name || relay.name.trim().length < 2) {
                    errors.push('Nom du point relais requis');
                }
                
                if (!relay.address1 || relay.address1.trim().length < 5) {
                    errors.push('Adresse du point relais requise');
                }
                
                if (!relay.postalCode || !/^\d{5}$/.test(relay.postalCode)) {
                    errors.push('Code postal du point relais invalide');
                }
                
                if (!relay.city || relay.city.trim().length < 2) {
                    errors.push('Ville du point relais requise');
                }
            }
        }
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
        // HEALTH CHECK TEMPORAIRE - Mode GET pour test immédiat
        if (req.method === 'GET') {
            console.log('HEALTH CHECK CREATE-CHECKOUT-SESSION');
            
            const envStatus = {
                STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? '' : '',
                STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? '' : '',
                SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
                SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '' : '',
                BREVO_API_KEY: process.env.BREVO_API_KEY ? '' : '',
                BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || ''
            };
            
            console.log('Variables environnement:', envStatus);
            
            const result = {
                success: true,
                message: 'Create Checkout Session API - OK',
                environment: {
                    node: process.version,
                    platform: process.platform,
                    arch: process.arch
                },
                services: {
                    stripe: envStatus.STRIPE_SECRET_KEY ? 'OK' : 'MISSING',
                    supabase: envStatus.SUPABASE_URL ? 'OK' : 'MISSING',
                    brevo: envStatus.BREVO_API_KEY ? 'OK' : 'MISSING'
                },
                brevo: envStatus.BREVO_API_KEY ? 'OK' : 'MISSING',
                message: 'Test des variables et connexions - webhook corrigé en attente de déploiement'
            };
            
            return res.status(200).json(result);
        }
        
        // TRAITEMENT NORMAL (méthode POST)
        console.log('=== REAL CHECKOUT HANDLER V2 ===');
        console.log('RAW REQ.BODY FULL:', JSON.stringify(req.body, null, 2));
        
        setCORS(req, res);
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Validation environnement au début
        validateEnvironment();
        
        console.log('=== CHECKOUT SESSION START V2 ===');
        
        // Handle don-libre case separately
        if (req.body.type === 'don-libre') {
            console.log('DON-LIBRE CASE');
            // Validate minimum amount (20 = 2000 centimes)
            if (!req.body.customAmount || req.body.customAmount < 2000) {
                console.error('DON-LIBRE ERROR: Amount too low:', req.body.customAmount);
                return res.status(400).json({ 
                    success: false,
                    error: 'Validation failed',
                    details: ['Minimum amount is 20']
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
                success_url: 'https://oradia.fr/success-don.html?session_id={CHECKOUT_SESSION_ID}',
                cancel_url: 'https://oradia.fr/don.html',
                customer_email: req.body.email?.trim(),
                metadata: {
                    type: 'don-libre',
                    amount: req.body.customAmount,
                    email: req.body.email?.trim() || '',
                    full_name: req.body.fullName?.trim() || '',
                    phone: req.body.phone?.trim() || '',
                    message: req.body.message?.trim() || ''
                }
            });

            return res.json({ 
                success: true, 
                sessionId: session.id 
            });
        }

        // Normalisation des données reçues du frontend
        const normalizedData = {
            items: req.body.items || [],
            customerInfo: req.body.customerInfo || {},
            delivery: req.body.delivery || {},
            relayPoint: req.body.relayPoint || null
        };

        console.log('=== NORMALIZED DATA V2 ===');
        console.log(JSON.stringify(normalizedData, null, 2));

        // Validation des données
        const errors = validateInput(normalizedData);
        
        if (errors.length > 0) {
            console.error('=== VALIDATION FAILED V2 ===');
            console.error(JSON.stringify(errors, null, 2));
            console.error('=== NORMALIZED DATA USED FOR VALIDATION V2 ===');
            console.error(JSON.stringify(normalizedData, null, 2));
            
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        // Configuration unique officielle des offres (prix en centimes)
        const OFFER_CONFIG = {
            standard: {
                name: 'Standard - Oracle Oradia',
                priceCents: 3800
            },
            'guidance-incluse': {
                name: 'Guidance Offerte - Oracle Oradia',
                priceCents: 4800
            },
            'edition-signature': {
                name: 'Édition Signature - Oracle Oradia',
                priceCents: 4200
            }
        };

        // Configuration des produits et poids (identique au frontend)
        const PRODUCT_WEIGHT_KG = 0.5; // 500g par oracle
        
        // Configuration des tarifs Mondial Relay France (en euros) - IDENTIQUE AU FRONTEND
        const MONDIAL_RELAY_RATES = {
            relay: [
                { max_weight: 0.25, price: 4.10 },
                { max_weight: 0.5, price: 4.10 },
                { max_weight: 1.0, price: 5.99 },
                { max_weight: 2.0, price: 7.99 },
                { max_weight: 4.0, price: 7.99 },
                { max_weight: 5.0, price: 15.99 },
                { max_weight: 7.0, price: 15.99 },
                { max_weight: 10.0, price: 15.99 },
                { max_weight: 15.0, price: 25.99 },
                { max_weight: 25.0, price: 25.99 }
            ],
            home: [
                { max_weight: 0.25, price: 4.99 },
                { max_weight: 0.5, price: 7.49 },
                { max_weight: 1.0, price: 9.49 },
                { max_weight: 2.0, price: 10.99 },
                { max_weight: 4.0, price: 16.39 },
                { max_weight: 5.0, price: 16.39 },
                { max_weight: 7.0, price: 24.99 },
                { max_weight: 10.0, price: 24.99 },
                { max_weight: 15.0, price: 31.49 },
                { max_weight: 25.0, price: 42.99 }
            ],
            hand_delivery: [
                { max_weight: Infinity, price: 0 } // Remise en main propre = gratuit
            ]
        };

        // Calculer le poids total
        const totalWeight = normalizedData.items.reduce((sum, item) => {
            return sum + (item.quantity * PRODUCT_WEIGHT_KG);
        }, 0);

        // Calculer le prix de livraison (utiliser la méthode du frontend)
        function calculateDeliveryPrice(weightKg, method) {
            if (method === 'hand_delivery') return 0;
            
            const rates = MONDIAL_RELAY_RATES[method];
            if (!rates) return 0;
            
            const rate = rates.find(r => weightKg <= r.max_weight);
            return rate ? rate.price : 0;
        }

        const calculatedDeliveryPrice = calculateDeliveryPrice(totalWeight, normalizedData.delivery.method);
        
        console.log('=== DELIVERY CALCULATION V2 ===');
        console.log('TOTAL WEIGHT (kg):', totalWeight);
        console.log('DELIVERY METHOD:', normalizedData.delivery.method);
        console.log('CALCULATED DELIVERY PRICE (EUR):', calculatedDeliveryPrice);
        console.log('FRONTEND SENT PRICE (EUR):', normalizedData.delivery.price / 100);
        
        // Utiliser le prix calculé par le serveur, ignorer totalement le prix frontend
        const deliveryPrice = calculatedDeliveryPrice;
        
        // Calculer le total et créer les line_items
        let totalAmount = 0;
        const lineItems = [];
        
        console.log('=== BUILDING LINE ITEMS V2 ===');
        
        for (const item of normalizedData.items) {
            const offerConfig = OFFER_CONFIG[item.offer];
            if (!offerConfig) {
                console.error(`UNKNOWN OFFER: ${item.offer}`);
                return res.status(400).json({ 
                    success: false,
                    error: 'Validation failed',
                    details: [`Offre inconnue: ${item.offer}`]
                });
            }
            
            const lineItem = {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: offerConfig.name,
                        description: `Quantité: ${item.quantity}`,
                        images: ['https://oradia.fr/images/medias/apercu_stripe.jpg']
                    },
                    unit_amount: offerConfig.priceCents,
                },
                quantity: item.quantity,
            };
            
            lineItems.push(lineItem);
            totalAmount += offerConfig.priceCents * item.quantity;
            
            console.log(`ITEM ADDED: ${offerConfig.name} x${item.quantity} = ${offerConfig.priceCents * item.quantity} centimes`);
        }
        
        // Ajouter les frais de livraison si applicable
        if (normalizedData.delivery.method !== 'hand_delivery' && deliveryPrice > 0) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: 'Frais de livraison',
                        description: `Livraison: ${normalizedData.delivery.method} (${totalWeight}kg)`,
                    },
                    unit_amount: Math.round(deliveryPrice * 100), // Convertir EUR en centimes
                },
                quantity: 1,
            });
            totalAmount += Math.round(deliveryPrice * 100);
            console.log(`DELIVERY ADDED: ${deliveryPrice}EUR = ${Math.round(deliveryPrice * 100)} centimes`);
        }

        console.log(`TOTAL AMOUNT: ${totalAmount} centimes (${totalAmount / 100}EUR)`);
        console.log('FINAL LINE ITEMS:', JSON.stringify(lineItems, null, 2));

        // URL de base robuste
        const baseUrl = process.env.FRONTEND_URL || req.headers.origin || 'https://oradia.fr';

        // Créer la session Stripe Checkout
        console.log('=== CREATING STRIPE SESSION V2 ===');
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: 'https://oradia.fr/success-precommande.html?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://oradia.fr/precommande-oracle.html',
            custom_text: {
              submit: {
                message: 'Merci pour ta confiance  ton voyage commence ici.'
              }
            },
            customer_email: normalizedData.customerInfo.email.trim(),
            metadata: {
                items: JSON.stringify(normalizedData.items),
                offer: normalizedData.items[0]?.offer || 'unknown',
                delivery_method: normalizedData.delivery.method,
                delivery_price_cents: normalizedData.delivery.price,
                total_weight: totalWeight,
                calculated_delivery_price: calculatedDeliveryPrice,
                full_name: normalizedData.customerInfo.fullName.trim(),
                email: normalizedData.customerInfo.email.trim(),
                phone: normalizedData.customerInfo.phone.trim(),
                shipping_address: normalizedData.customerInfo.shippingAddress?.trim() || '',
                address_complement: normalizedData.customerInfo.addressComplement?.trim() || '',
                postal_code: normalizedData.customerInfo.postalCode?.trim() || '',
                city: normalizedData.customerInfo.city?.trim() || '',
                country: normalizedData.customerInfo.country,
                total_amount: totalAmount,
                delivery_price: Math.round(deliveryPrice * 100), // En centimes pour Stripe
                // Métadonnées point relais si applicable
                ...(normalizedData.relayPoint && {
                    relay_id: normalizedData.relayPoint.id,
                    relay_name: normalizedData.relayPoint.name,
                    relay_address1: normalizedData.relayPoint.address1,
                    relay_address2: normalizedData.relayPoint.address2 || '',
                    relay_postal_code: normalizedData.relayPoint.postalCode,
                    relay_city: normalizedData.relayPoint.city,
                    relay_country: normalizedData.relayPoint.country || 'FR'
                })
            }
        });

        console.log(`=== STRIPE SESSION CREATED V2: ${session.id} ===`);
        console.log('SESSION URL:', session.url);

        // Enregistrer la commande pending en base
        const orderData = {
            stripe_session_id: session.id,
            email: normalizedData.customerInfo.email.trim(),
            items: normalizedData.items,
            amount_total: totalAmount,
            currency: 'eur',
            full_name: normalizedData.customerInfo.fullName.trim(),
            phone: normalizedData.customerInfo.phone.trim(),
            shipping_address: normalizedData.customerInfo.shippingAddress?.trim() || '',
            address_complement: normalizedData.customerInfo.addressComplement?.trim() || '',
            postal_code: normalizedData.customerInfo.postalCode?.trim() || '',
            city: normalizedData.customerInfo.city?.trim() || '',
            country: normalizedData.customerInfo.country,
            // Informations de livraison
            shipping_method: normalizedData.delivery.method,
            shipping_price_cents: normalizedData.delivery.price,
            shipping_provider: normalizedData.delivery.method === 'relay' || normalizedData.delivery.method === 'home' ? 'mondial_relay' : null,
            shipping_status: normalizedData.delivery.method === 'hand_delivery' ? 'not_required' : 'pending_label',
            // Point relais si applicable
            ...(normalizedData.relayPoint && {
                relay_id: normalizedData.relayPoint.id,
                relay_name: normalizedData.relayPoint.name,
                relay_address1: normalizedData.relayPoint.address1,
                relay_address2: normalizedData.relayPoint.address2 || '',
                relay_postal_code: normalizedData.relayPoint.postalCode,
                relay_city: normalizedData.relayPoint.city,
                relay_country: normalizedData.relayPoint.country || 'FR'
            }),
            total_weight: totalWeight,
            calculated_delivery_price: calculatedDeliveryPrice,
            delivery_price: Math.round(deliveryPrice * 100), // En centimes pour la base
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
