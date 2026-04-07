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
            console.log('Health check create-checkout-session');
            
            // Test connexion Supabase
            let supabaseTest = 'KO';
            try {
                const { count, error } = await supabase
                    .from('preorders')
                    .select('count', { count: 'exact', head: true });
                
                if (error) {
                    supabaseTest = `KO: ${error.message}`;
                } else {
                    supabaseTest = `OK: ${count} précommandes`;
                }
            } catch (error) {
                supabaseTest = `KO: ${error.message}`;
            }
            
            // Test connexion Brevo
            let brevoTest = 'KO';
            if (process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) {
                try {
                    const response = await fetch('https://api.brevo.com/v3/account', {
                        headers: { 'api-key': process.env.BREVO_API_KEY }
                    });
                    
                    if (response.ok) {
                        brevoTest = 'OK: Connexion réussie';
                    } else {
                        brevoTest = `KO: ${response.status}`;
                    }
                } catch (error) {
                    brevoTest = `KO: ${error.message}`;
                }
            } else {
                brevoTest = 'KO: Variables manquantes';
            }
            
            const result = {
                status: 'Health check create-checkout-session',
                timestamp: new Date().toISOString(),
                tests: {
                    supabase: supabaseTest,
                    brevo: brevoTest
                },
                message: 'Test des connexions - webhook corrigé en attente de déploiement'
            };
            
            return res.status(200).json(result);
        }
        
        // TRAITEMENT NORMAL (méthode POST)
        console.log('Real checkout handler V2');
        
        setCORS(req, res);
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ 
                success: false,
                error: 'Method not allowed',
                message: 'Méthode non autorisée'
            });
        }

        // Validation environnement au début
        validateEnvironment();
        
        console.log('Checkout session start V2');
        
        // Handle don-libre case separately
        if (req.body.type === 'don-libre') {
            console.log('Don-libre case');
            // Validate minimum amount (20€ = 2000 centimes)
            if (!req.body.customAmount || req.body.customAmount < 2000) {
                console.error('Don-libre error: Amount too low:', req.body.customAmount);
                return res.status(400).json({ 
                    success: false,
                    error: 'Validation failed',
                    message: 'Le montant minimum est de 20€'
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
                metadata: {
                    offer: 'contribution-libre',
                    email: req.body.email || 'contribution@oradia.fr',
                    full_name: req.body.fullName || 'Contribution ORADIA',
                    amount: (req.body.customAmount / 100).toString(),
                    source: 'oradia-contribution'
                }
            });

            console.log('Don-libre session created:', session.id);
            return res.json({ url: session.url });
        }

        // Lecture correcte du nouveau format structuré
        const body = req.body || {};
        const items = Array.isArray(body.items) ? body.items : [];
        const customerInfo = body.customerInfo || {};
        const delivery = body.delivery || {};
        
        console.log('Structured body parsing V2');
        
        // Création de l'objet normalisé unique
        const normalizedData = {
            items: items,
            fullName: customerInfo.fullName || '',
            email: customerInfo.email || '',
            phone: customerInfo.phone || '',
            shippingAddress: customerInfo.shippingAddress || '',
            addressComplement: customerInfo.addressComplement || '',
            postalCode: customerInfo.postalCode || '',
            city: customerInfo.city || '',
            country: customerInfo.country || 'FR',
            deliveryMethod: delivery.method || null,
            deliveryPrice: delivery.price || 0
        };
        
        console.log('Normalized data from structured format V2');
        
        // Validation directe sur l'objet normalisé
        const errors = [];
        
        // Validation des items
        if (!normalizedData.items || !Array.isArray(normalizedData.items) || normalizedData.items.length === 0) {
            errors.push('Panier vide invalide');
        } else {
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
        
        console.log('Validation errors:', errors.length > 0 ? errors.join(', ') : 'None');
        
        if (errors.length > 0) {
            console.error('Validation failed:', errors.join(', '));
            
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: errors.join(', ')
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

        // Calculer le poids total de la commande (identique au frontend)
        function calculateTotalWeight(items) {
            let totalWeight = 0;
            
            items.forEach(item => {
                totalWeight += item.quantity * PRODUCT_WEIGHT_KG;
            });
            
            return totalWeight;
        }

        // Calculer le tarif de livraison selon le poids et le mode (identique au frontend)
        function calculateDeliveryPrice(weight, deliveryMethod) {
            if (deliveryMethod === 'hand_delivery') {
                return 0;
            }
            
            const rates = MONDIAL_RELAY_RATES[deliveryMethod];
            if (!rates) {
                console.error('Mode de livraison non trouvé:', deliveryMethod);
                return 0;
            }
            
            // Trouver la tranche applicable
            for (const rate of rates) {
                if (weight <= rate.max_weight) {
                    return rate.price;
                }
            }
            
            // Si aucune tranche ne correspond (poids trop élevé)
            return rates[rates.length - 1].price;
        }

        // Calculer le poids total et le prix de livraison selon la logique exacte du frontend
        const totalWeight = calculateTotalWeight(normalizedData.items);
        const calculatedDeliveryPrice = calculateDeliveryPrice(totalWeight, normalizedData.deliveryMethod);
        
        console.log('=== DELIVERY CALCULATION V2 ===');
        console.log('TOTAL WEIGHT (kg):', totalWeight);
        console.log('DELIVERY METHOD:', normalizedData.deliveryMethod);
        console.log('CALCULATED DELIVERY PRICE (€):', calculatedDeliveryPrice);
        console.log('FRONTEND SENT PRICE (€):', normalizedData.deliveryPrice);
        
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
            
            console.log(`Item added: ${offerConfig.name} x${item.quantity}`);
        }
        
        // Ajouter les frais de livraison si applicable
        if (normalizedData.deliveryMethod !== 'hand_delivery' && deliveryPrice > 0) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: 'Frais de livraison',
                        description: `Livraison: ${normalizedData.deliveryMethod} (${totalWeight}kg)`,
                    },
                    unit_amount: Math.round(deliveryPrice * 100), // Convertir € en centimes
                },
                quantity: 1,
            });
            totalAmount += Math.round(deliveryPrice * 100);
            console.log(`Delivery added: ${deliveryPrice}€`);
        }

        console.log(`Total amount: ${totalAmount} centimes (${totalAmount / 100}€)`);

        // URL de base robuste
        const baseUrl = process.env.FRONTEND_URL || req.headers.origin || 'https://oradia.fr';

        // Créer la session Stripe Checkout
        console.log('Creating Stripe session');

        // Extraire relayPoint du body original
        const relayPoint = body.relayPoint || null;

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
                offer: normalizedData.items[0]?.offer || 'unknown',
                delivery_method: normalizedData.deliveryMethod,
                delivery_price_cents: normalizedData.deliveryPrice,
                total_weight: totalWeight,
                calculated_delivery_price: calculatedDeliveryPrice,
                full_name: normalizedData.fullName.trim(),
                email: normalizedData.email.trim(),
                phone: normalizedData.phone.trim(),
                shipping_address: normalizedData.shippingAddress?.trim() || '',
                address_complement: normalizedData.addressComplement?.trim() || '',
                postal_code: normalizedData.postalCode?.trim() || '',
                city: normalizedData.city?.trim() || '',
                country: normalizedData.country,
                total_amount: totalAmount,
                delivery_price: Math.round(deliveryPrice * 100), // En centimes pour Stripe
                // Métadonnées point relais si applicable
                ...(relayPoint && {
                    relay_id: relayPoint.id,
                    relay_name: relayPoint.name,
                    relay_address1: relayPoint.address1,
                    relay_address2: relayPoint.address2 || '',
                    relay_postal_code: relayPoint.postalCode,
                    relay_city: relayPoint.city,
                    relay_country: relayPoint.country || 'FR'
                })
            }
        });

        // Données à insérer dans la base de données
        const orderData = {
            stripe_session_id: session.id,
            email: normalizedData.email.trim(),
            items: normalizedData.items,
            amount_total: totalAmount / 100,
            currency: 'eur',
            full_name: normalizedData.fullName.trim(),
            phone: normalizedData.phone.trim(),
            shipping_address: normalizedData.shippingAddress?.trim() || '',
            address_complement: normalizedData.addressComplement?.trim() || '',
            postal_code: normalizedData.postalCode?.trim() || '',
            city: normalizedData.city?.trim() || '',
            country: normalizedData.country,
            offer: normalizedData.items[0]?.offer || null,
            // Informations de livraison
            shipping_method: normalizedData.deliveryMethod,
            shipping_price_cents: Math.round(deliveryPrice * 100),
            shipping_provider: normalizedData.deliveryMethod === 'relay' || normalizedData.deliveryMethod === 'home' ? 'mondial_relay' : null,
            shipping_status: 'pending',
            // Point relais si applicable
            ...(relayPoint && {
                relay_id: relayPoint.id,
                relay_name: relayPoint.name,
                relay_address1: relayPoint.address1,
                relay_address2: relayPoint.address2 || '',
                relay_postal_code: relayPoint.postalCode,
                relay_city: relayPoint.city,
                relay_country: relayPoint.country || 'FR'
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
            message: 'Une erreur est survenue lors de la création de la session'
        });
    }
};
