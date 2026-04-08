const { createClient } = require('@supabase/supabase-js');

function getStripeClient() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, supabaseKey);
}

// Validation des variables d'environnement critiques
function validateEnvironment() {
    const missing = [];

    if (!process.env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
    }

    if (missing.length > 0) {
        throw new Error(`Configuration error: Missing ${missing.join(', ')}`);
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey.startsWith('sk_')) {
        throw new Error('Invalid STRIPE_SECRET_KEY format');
    }
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
        // TRAITEMENT NORMAL (méthode POST)
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
        
        // Création des clients après validation
        const supabase = getSupabaseClient();
        const stripe = getStripeClient();
        
        // Configuration URLs unique
        const frontendUrl = process.env.FRONTEND_URL || 'https://oradia.fr';
        
        // Handle don-libre case separately
        if (req.body.type === 'don-libre') {
            // Validate minimum amount (20€ = 2000 centimes)
            if (!req.body.customAmount || req.body.customAmount < 2000) {
                console.error('Validation failed: amount too low');
                return res.status(400).json({ 
                    success: false,
                    error: 'Validation failed',
                    message: 'Le montant minimum est de 20€'
                });
            }

            const donationEmail = String(req.body.email || 'contribution@oradia.fr').trim();
            const donationFullName = String(req.body.fullName || 'Contribution ORADIA').trim();

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
                success_url: `${frontendUrl}/success-contribution.html`,
                cancel_url: `${frontendUrl}/precommande-oracle.html#contribution-libre`,
                metadata: {
                    offer: 'contribution-libre',
                    email: donationEmail,
                    full_name: donationFullName,
                    amount: (req.body.customAmount / 100).toString(),
                    source: 'oradia-contribution'
                }
            });

            return res.json({ url: session.url });
        }

        // Lecture correcte du nouveau format structuré
        const body = req.body || {};
        const items = Array.isArray(body.items) ? body.items : [];
        const customerInfo = body.customerInfo || {};
        const delivery = body.delivery || {};
        const relayPoint = body.relayPoint || null;
        
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
            deliveryMethod: delivery.method || null
        };
        
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
        
        // Validation du mode de livraison d'abord
        const allowedDeliveryMethods = ['home', 'relay', 'hand_delivery'];
        if (!normalizedData.deliveryMethod || !allowedDeliveryMethods.includes(normalizedData.deliveryMethod)) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'Mode de livraison invalide'
            });
        }
        
        // Validation du client
        const safeEmail = String(normalizedData.email || '').trim();
        const safePhone = String(normalizedData.phone || '').trim();
        const safeFullName = String(normalizedData.fullName || '').trim();
        
        if (!safeFullName || safeFullName.length < 2) {
            errors.push('Nom complet requis (min 2 caractères)');
        }
        
        if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
            errors.push('Email invalide');
        }
        
        // Validation de l'adresse selon le mode de livraison
        if (normalizedData.deliveryMethod === 'home') {
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
        
        // Validation du point relais si livraison en relay
        if (normalizedData.deliveryMethod === 'relay') {
            if (
                !relayPoint ||
                !relayPoint.id ||
                !relayPoint.name ||
                !relayPoint.address1 ||
                !relayPoint.postalCode ||
                !relayPoint.city
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    message: 'Point relais requis pour la livraison en point relais'
                });
            }
        }
        
        // Validation des erreurs restantes
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
        
        // Utiliser le prix calculé par le serveur, ignorer totalement le prix frontend
        const deliveryPrice = calculatedDeliveryPrice;
        
        // Factorisation de l'offre principale pour éviter la duplication
        const primaryOffer = normalizedData.items[0]?.offer || null;
        const primaryOfferForStripe = primaryOffer || '';
        
        // Calculer le total et créer les line_items
        let totalAmount = 0;
        const lineItems = [];
        
        for (const item of normalizedData.items) {
            const offerConfig = OFFER_CONFIG[item.offer];
            if (!offerConfig) {
                console.error('Validation failed: unknown offer');
                return res.status(400).json({ 
                    success: false,
                    error: 'Validation failed',
                    message: `Offre inconnue: ${item.offer}`
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
        }

        // Créer la session Stripe Checkout

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${frontendUrl}/success-precommande.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${frontendUrl}/precommande-oracle.html`,
            custom_text: {
              submit: {
                message: '✨ Merci pour ta confiance — ton voyage commence ici.'
              }
            },
            customer_email: safeEmail,
            metadata: {
                offer: primaryOfferForStripe,
                delivery_method: normalizedData.deliveryMethod || '',
                delivery_price_cents: String(Math.round(deliveryPrice * 100)),
                total_amount_cents: String(totalAmount),
                // Champs client pour reconstruction webhook
                full_name: safeFullName,
                email: safeEmail,
                phone: safePhone,
                shipping_address: normalizedData.shippingAddress?.trim() || '',
                address_complement: normalizedData.addressComplement?.trim() || '',
                postal_code: normalizedData.postalCode?.trim() || '',
                city: normalizedData.city?.trim() || '',
                country: normalizedData.country || 'FR',
                // Métadonnées point relais si applicable
                ...(relayPoint && {
                    relay_id: relayPoint.id || '',
                    relay_name: relayPoint.name || '',
                    relay_address1: relayPoint.address1 || '',
                    relay_address2: relayPoint.address2 || '',
                    relay_postal_code: relayPoint.postalCode || '',
                    relay_city: relayPoint.city || '',
                    relay_country: relayPoint.country || 'FR'
                })
            }
        });

        // Données à insérer dans la base de données
        const orderData = {
            stripe_session_id: session.id,
            email: safeEmail,
            items: normalizedData.items,
            amount_total: totalAmount / 100,
            currency: 'eur',
            full_name: safeFullName,
            phone: safePhone,
            shipping_address: normalizedData.shippingAddress?.trim() || '',
            address_complement: normalizedData.addressComplement?.trim() || '',
            postal_code: normalizedData.postalCode?.trim() || '',
            city: normalizedData.city?.trim() || '',
            country: normalizedData.country || 'FR',
            offer: primaryOffer,
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
            calculated_delivery_price_eur: calculatedDeliveryPrice,
            paid_status: 'pending',
            source: 'oradia-livraison'
        };

        const { error: insertError } = await supabase
            .from('preorders')
            .upsert(orderData, {
                onConflict: 'stripe_session_id',
                ignoreDuplicates: false
            });

        if (insertError) {
            console.error('Failed to insert pending order:', insertError.message);
            // On continue pour ne pas bloquer le paiement.
            // La persistance finale dépendra du webhook Stripe.
        }

        res.json({ 
            success: true,
            sessionId: session.id
        });

    } catch (error) {
        console.error('Checkout session creation failed:', error.message);
        
        // Toujours renvoyer du JSON, même en cas d'erreur
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: 'Une erreur est survenue lors de la création de la session'
        });
    }
};
