const { createClient } = require('@supabase/supabase-js');

function getStripeClient() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Offres, prix, stock, pays livrés, formats de code postal et grilles de port :
// source unique partagée avec l'affichage (voir lib/shop-config.js).
const shopConfig = require('../lib/shop-config.js');
const { getShopMode, countSoldByOffer } = require('../lib/shop-mode.js');
const {
    OFFERS, SHIPPING_COUNTRIES, POSTAL_CODE_RULES, POSTAL_CODE_LABELS,
    MAX_QUANTITY_PER_OFFER, MAX_TOTAL_QUANTITY
} = shopConfig;

function getSupabaseClient() {
  // URL Supabase du projet oradia-prod (nxzetkdozynyutlbhxdx)
  const supabaseUrl = process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co';
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
        'https://oradia-site.vercel.app',
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

        // ── Portail de facturation Stripe (mise à jour du moyen de paiement sur
        // l'abonnement Tore existant, sans créer un second abonnement). Ajouté ici plutôt
        // que dans une route dédiée : le projet est déjà à 12/12 fonctions Vercel (limite
        // du plan Hobby, voir CLAUDE.md), et cette route gère déjà la création de sessions
        // Stripe côté abonnement.
        if (req.body.type === 'billing-portal') {
            const email = (req.body.email || '').trim().toLowerCase();
            if (!email) return res.status(400).json({ error: 'email requis' });
            const { data: sub } = await supabase
                .from('tore_subscriptions')
                .select('stripe_customer_id')
                .ilike('email', email)
                .not('stripe_customer_id', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (!sub?.stripe_customer_id) {
                return res.status(404).json({ error: 'Aucun abonnement Stripe trouvé pour cet email' });
            }
            const portalSession = await stripe.billingPortal.sessions.create({
                customer: sub.stripe_customer_id,
                return_url: `${frontendUrl}/member/abonnements.html`
            });
            return res.json({ success: true, url: portalSession.url });
        }

        // ── Abonnement Complet (8€/mois) ─────────────────────────────────────────
        if (req.body.type === 'tore-complet' || req.body.type === 'tore-decouverte') {
            // Normalisé dès la création de la session : cet email finit dans les metadata
            // Stripe, relues telles quelles par le webhook pour créer/retrouver la ligne
            // tore_subscriptions (comparaisons Postgres sensibles à la casse) — le normaliser
            // ici évite d'introduire une casse incohérente dès le départ.
            const email    = (req.body.email || '').trim().toLowerCase();
            const fullName = (req.body.fullName || '').trim();
            const plan    = 'complet';
            const priceId = process.env.STRIPE_PRICE_COMPLET;
            if (!priceId) return res.status(500).json({ error: 'STRIPE_PRICE_COMPLET non configuré' });
            let promoCode = (req.body.promoCode || '').trim();
            // Le code promo "5€ le 1er mois" est réservé aux nouveaux abonnés : jamais
            // fait confiance au client sur ce point, on vérifie ici si cet email a déjà eu
            // un abonnement Stripe (stripe_customer_id posé par le webhook au premier
            // paiement réussi). Sans ce contrôle, un abonné dont le paiement a échoué (ou
            // qui a résilié) pouvait resouscrire via le lien promo et réobtenir la remise
            // indéfiniment — Stripe n'empêche pas nativement la réutilisation d'un code
            // promo par le même client sur une nouvelle session de checkout.
            if (promoCode && email) {
                const { data: priorSub } = await supabase
                    .from('tore_subscriptions')
                    .select('stripe_customer_id')
                    .ilike('email', email)
                    .not('stripe_customer_id', 'is', null)
                    .limit(1)
                    .maybeSingle();
                if (priorSub?.stripe_customer_id) {
                    promoCode = '';
                }
            }
            const sessionParams = {
                payment_method_types: ['card'],
                mode: 'subscription',
                line_items: [{ price: priceId, quantity: 1 }],
                success_url: `${frontendUrl}/success-tore.html?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url:  `${frontendUrl}/tore.html?cancelled=1`,
                metadata: { offer: 'tore-subscription', plan, email, full_name: fullName },
                subscription_data: { metadata: { email, full_name: fullName, plan } }
            };
            if (promoCode) {
                sessionParams.discounts = [{ promotion_code: promoCode }];
            }
            // Pré-remplir l'email si connu, sinon Stripe le collecte pendant le checkout
            if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                sessionParams.customer_email = email;
            }
            const session = await stripe.checkout.sessions.create(sessionParams);
            return res.json({ success: true, url: session.url });
        }

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
        // Adresse de facturation différente (case à cocher de livraison.html) : envoyée
        // depuis toujours par le formulaire mais ignorée ici — la facture Stripe ne la
        // portait donc jamais.
        const rawBilling = body.billingInfo || customerInfo.billingInfo || null;
        const billing = rawBilling && rawBilling.isDifferent ? {
            address: String(rawBilling.address || '').trim(),
            addressComplement: String(rawBilling.addressComplement || '').trim(),
            postalCode: String(rawBilling.postalCode || '').trim(),
            city: String(rawBilling.city || '').trim(),
            country: String(rawBilling.country || 'FR').trim().toUpperCase()
        } : null;
        
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
            const allowedOffers = Object.keys(OFFERS);
            const seenOffers = new Set();
            let totalQuantity = 0;
            
            for (const item of normalizedData.items) {
                if (!item.offer || !allowedOffers.includes(item.offer)) {
                    errors.push(`Offre invalide: ${item.offer}`);
                } else if (seenOffers.has(item.offer)) {
                    errors.push(`Offre en double dans le panier: ${item.offer}`);
                } else {
                    seenOffers.add(item.offer);
                }
                if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY_PER_OFFER) {
                    errors.push(`Quantité invalide pour l'offre ${item.offer} (entre 1 et ${MAX_QUANTITY_PER_OFFER})`);
                } else {
                    totalQuantity += item.quantity;
                }
            }
            if (totalQuantity > MAX_TOTAL_QUANTITY) {
                errors.push(`Commande limitée à ${MAX_TOTAL_QUANTITY} exemplaires — contactez-nous pour une commande plus importante`);
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
            const country = String(normalizedData.country || 'FR').toUpperCase();
            normalizedData.country = country;
            if (!SHIPPING_COUNTRIES.includes(country)) {
                errors.push('Livraison non disponible dans ce pays (France et Belgique uniquement) — contactez-nous');
            }

            if (!normalizedData.shippingAddress || normalizedData.shippingAddress.trim().length < 5) {
                errors.push('Adresse requise (min 5 caractères)');
            }
            
            const postalRule = POSTAL_CODE_RULES[country] || POSTAL_CODE_RULES.FR;
            const postalCode = String(normalizedData.postalCode || '').trim();
            normalizedData.postalCode = postalCode;
            if (!postalRule.test(postalCode)) {
                errors.push(`Code postal invalide (${POSTAL_CODE_LABELS[country] || '5 chiffres'} requis)`);
            }
            
            if (!normalizedData.city || normalizedData.city.trim().length < 2) {
                errors.push('Ville requise (min 2 caractères)');
            }
        }
        
        if (billing) {
            if (billing.address.length < 5) errors.push('Adresse de facturation requise (min 5 caractères)');
            if (!POSTAL_CODE_RULES[billing.country]) {
                errors.push('Pays de facturation non pris en charge');
            } else if (!POSTAL_CODE_RULES[billing.country].test(billing.postalCode)) {
                errors.push(`Code postal de facturation invalide (${POSTAL_CODE_LABELS[billing.country]} requis)`);
            }
            if (billing.city.length < 2) errors.push('Ville de facturation requise (min 2 caractères)');
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
            relayPoint.country = String(relayPoint.country || 'FR').toUpperCase();
            if (!SHIPPING_COUNTRIES.includes(relayPoint.country)) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    message: 'Point relais disponible en France et en Belgique uniquement'
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

        // ── Mode de vente : précommande ou vente ferme ─────────────────────────
        // Piloté par les interrupteurs Boutique du dashboard : un mode fermé est refusé
        // ici, même si une ancienne page restée ouverte envoie encore la demande.
        const saleMode = shopConfig.isValidSaleMode(body.saleMode) ? body.saleMode : 'preorder';
        const shopMode = await getShopMode(supabase);
        if (!shopMode[saleMode]) {
            return res.status(403).json({
                success: false,
                error: 'sale_mode_closed',
                message: saleMode === 'order'
                    ? "La vente en ligne de l'oracle n'est pas encore ouverte."
                    : "Les précommandes sont closes. Rendez-vous sur la page Commande pour acheter l'oracle."
            });
        }

        // ── Stock limité (Édition Signature : 100 exemplaires tous modes confondus) ──
        const limitedOffers = normalizedData.items.filter(it => OFFERS[it.offer]?.stockMax != null);
        if (limitedOffers.length > 0) {
            const { data: paidRows, error: stockError } = await supabase
                .from('preorders')
                .select('items, offer')
                .eq('paid_status', 'completed');
            if (stockError) {
                console.error('Lecture du stock impossible:', stockError.message);
                return res.status(503).json({
                    success: false,
                    error: 'stock_unavailable',
                    message: 'Impossible de vérifier le stock pour le moment. Merci de réessayer dans quelques minutes.'
                });
            }
            const sold = countSoldByOffer(paidRows);
            for (const it of limitedOffers) {
                const remaining = OFFERS[it.offer].stockMax - (sold[it.offer] || 0);
                if (it.quantity > remaining) {
                    return res.status(409).json({
                        success: false,
                        error: 'out_of_stock',
                        message: remaining > 0
                            ? `Il ne reste que ${remaining} exemplaire(s) de l'offre ${OFFERS[it.offer].label}.`
                            : `L'offre ${OFFERS[it.offer].label} est épuisée.`
                    });
                }
            }
        }

        const destinationCountry = normalizedData.deliveryMethod === 'relay'
            ? relayPoint.country
            : (normalizedData.country || 'FR');

        // Calculer le poids total et le prix de livraison selon la logique exacte du frontend
        const totalWeight = shopConfig.totalWeightKg(normalizedData.items);
        const calculatedDeliveryPrice = shopConfig.calculateShippingEuros(totalWeight, normalizedData.deliveryMethod, destinationCountry);
        
        // Utiliser le prix calculé par le serveur, ignorer totalement le prix frontend
        const deliveryPrice = calculatedDeliveryPrice;
        
        // Factorisation de l'offre principale pour éviter la duplication
        const primaryOffer = normalizedData.items[0]?.offer || null;
        const primaryOfferForStripe = primaryOffer || '';
        
        // Calculer le total et créer les line_items
        let totalAmount = 0;
        const lineItems = [];
        
        for (const item of normalizedData.items) {
            const offerConfig = OFFERS[item.offer];
            const unitPriceCents = shopConfig.getOfferPriceCents(item.offer, saleMode);
            if (!offerConfig || !unitPriceCents) {
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
                        name: offerConfig.stripeName,
                        description: `Quantité: ${item.quantity}`,
                        images: ['https://oradia.fr/images/medias/apercu_stripe.jpg']
                    },
                    unit_amount: unitPriceCents,
                },
                quantity: item.quantity,
            };
            
            lineItems.push(lineItem);
            totalAmount += unitPriceCents * item.quantity;
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

        // Adresse qui figurera sur la facture Stripe : facturation si différente, sinon
        // adresse de livraison à domicile. Stripe ne reprend une adresse sur la facture
        // que si elle est portée par un objet Customer — d'où sa création ici. En cas
        // d'échec, on retombe sur customer_email (comportement historique).
        const invoiceAddress = billing
            ? { line1: billing.address, line2: billing.addressComplement || undefined, postal_code: billing.postalCode, city: billing.city, country: billing.country }
            : (normalizedData.deliveryMethod === 'home'
                ? { line1: normalizedData.shippingAddress.trim(), line2: normalizedData.addressComplement?.trim() || undefined, postal_code: normalizedData.postalCode, city: normalizedData.city.trim(), country: normalizedData.country || 'FR' }
                : null);
        let stripeCustomerId = null;
        if (invoiceAddress) {
            try {
                const customer = await stripe.customers.create({
                    email: safeEmail,
                    name: safeFullName,
                    ...(safePhone ? { phone: safePhone } : {}),
                    address: invoiceAddress,
                    metadata: { source: 'oradia-precommande' }
                });
                stripeCustomerId = customer.id;
            } catch (customerError) {
                console.error('Création du client Stripe échouée (facture sans adresse):', customerError.message);
            }
        }

        // Créer la session Stripe Checkout

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            // value en clair dans l'URL (pas une donnée sensible, juste un montant) : évite un
            // aller-retour serveur depuis success-precommande.html pour retrouver le montant payé
            // au moment de déclencher la conversion Google Ads (voir js/gtag-init.js).
            success_url: `${frontendUrl}/success-precommande.html?session_id={CHECKOUT_SESSION_ID}&value=${(totalAmount / 100).toFixed(2)}${saleMode === 'order' ? '&mode=order' : ''}`,
            cancel_url: `${frontendUrl}/livraison.html?checkout=cancelled${saleMode === 'order' ? '&mode=order' : ''}`,
            custom_text: {
              submit: {
                message: '✨ Merci pour ta confiance — ton voyage commence ici.'
              }
            },
            ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: safeEmail }),
            invoice_creation: {
                enabled: true,
                invoice_data: {
                    description: `${saleMode === 'order' ? 'Commande' : 'Précommande'} Oracle Oradia - ${OFFERS[primaryOffer]?.label || 'Standard'}`,
                    custom_fields: [
                        {
                            name: 'Type',
                            value: saleMode === 'order' ? 'Commande' : 'Précommande'
                        }
                    ],
                    footer: 'ORADIA - Rudy Boucheron - Micro-entreprise - SIRET: 82130800400034 - APE: 9609Z - contact@oradia.fr'
                }
            },
            metadata: {
                offer: primaryOfferForStripe,
                sale_mode: saleMode,
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
                ...(billing && {
                    billing_address: billing.address,
                    billing_address_complement: billing.addressComplement,
                    billing_postal_code: billing.postalCode,
                    billing_city: billing.city,
                    billing_country: billing.country
                }),
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
            ...(billing && {
                billing_address: billing.address,
                billing_address_complement: billing.addressComplement || null,
                billing_postal_code: billing.postalCode,
                billing_city: billing.city,
                billing_country: billing.country
            }),
            total_weight: totalWeight,
            calculated_delivery_price_eur: calculatedDeliveryPrice,
            paid_status: 'pending',
            source: 'oradia-livraison',
            order_type: saleMode
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
            sessionId: session.id,
            url: session.url
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
