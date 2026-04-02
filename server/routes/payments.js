const express = require('express');
const { body, validationResult } = require('express-validator');
const stripeService = require('../services/stripeService');
const { checkFreemiumAccess, useTraverseeCredit, associateDeviceToUser } = require('../middleware/freemium');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Configuration des offres
const OFFERS = {
    'standard': {
        name: 'Oracle Oradia - Standard',
        price: 3800, // 38€ en centimes
        description: "L'oracle complet"
    },
    'guidance-incluse': {
        name: 'Oracle Oradia - Guidance Offerte',
        price: 4800, // 48€ en centimes
        description: "1h de guidance offerte (valeur réelle 60€)"
    },
    'edition-signature': {
        name: 'Oracle Oradia - Édition Signature',
        price: 5200, // 52€ en centimes
        description: "Édition limitée numérotée + dédicace"
    }
};

// Configuration des produits et poids
const PRODUCT_WEIGHT_KG = 0.5; // 500g par oracle

// Configuration des tarifs Mondial Relay France (en centimes)
const MONDIAL_RELAY_RATES = {
    relay: [
        { max_weight: 0.25, price: 410 },
        { max_weight: 0.5, price: 410 },
        { max_weight: 1.0, price: 599 },
        { max_weight: 2.0, price: 799 },
        { max_weight: 4.0, price: 799 },
        { max_weight: 5.0, price: 1599 },
        { max_weight: 7.0, price: 1599 },
        { max_weight: 10.0, price: 1599 },
        { max_weight: 15.0, price: 2599 },
        { max_weight: 25.0, price: 2599 }
    ],
    home: [
        { max_weight: 0.25, price: 499 },
        { max_weight: 0.5, price: 749 },
        { max_weight: 1.0, price: 949 },
        { max_weight: 2.0, price: 1099 },
        { max_weight: 4.0, price: 1639 },
        { max_weight: 5.0, price: 1639 },
        { max_weight: 7.0, price: 2499 },
        { max_weight: 10.0, price: 2499 },
        { max_weight: 15.0, price: 3149 },
        { max_weight: 25.0, price: 4299 }
    ],
    hand_delivery: [
        { max_weight: Infinity, price: 0 } // Remise en main propre = gratuit
    ]
};

// Calculer le poids total de la commande
function calculateTotalWeight(items) {
    let totalWeight = 0;
    
    items.forEach(item => {
        totalWeight += item.quantity * PRODUCT_WEIGHT_KG;
    });
    
    return totalWeight;
}

// Calculer le tarif de livraison selon le poids et le mode
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

// Validation des données de précommande
const validatePreorder = [
    body('items')
        .isArray({ min: 1 })
        .withMessage('Au moins un article est requis'),
    body('items.*.offer')
        .notEmpty()
        .withMessage('L\'offre est requise'),
    body('items.*.quantity')
        .isInt({ min: 1, max: 10 })
        .withMessage('La quantité doit être entre 1 et 10'),
    body('customerInfo.firstName')
        .notEmpty()
        .withMessage('Le prénom est requis')
        .isLength({ min: 2 })
        .withMessage('Le prénom doit contenir au moins 2 caractères'),
    body('customerInfo.lastName')
        .notEmpty()
        .withMessage('Le nom est requis')
        .isLength({ min: 2 })
        .withMessage('Le nom doit contenir au moins 2 caractères'),
    body('customerInfo.fullName')
        .notEmpty()
        .withMessage('Le nom complet est requis')
        .isLength({ min: 2 })
        .withMessage('Le nom complet doit contenir au moins 2 caractères'),
    body('customerInfo.email')
        .isEmail()
        .withMessage('L\'email doit être valide'),
    body('customerInfo.phone')
        .optional()
        .isMobilePhone('fr-FR')
        .withMessage('Le numéro de téléphone doit être valide'),
    body('customerInfo.shippingAddress')
        .if(body('delivery.method').equals('home').or(body('delivery.method').equals('relay')))
        .notEmpty()
        .withMessage('L\'adresse est requise')
        .isLength({ min: 5 })
        .withMessage('L\'adresse doit contenir au moins 5 caractères'),
    body('customerInfo.postalCode')
        .if(body('delivery.method').equals('home').or(body('delivery.method').equals('relay')))
        .matches(/^\d{5}$/)
        .withMessage('Le code postal doit contenir 5 chiffres'),
    body('customerInfo.city')
        .if(body('delivery.method').equals('home').or(body('delivery.method').equals('relay')))
        .notEmpty()
        .withMessage('La ville est requise')
        .isLength({ min: 2 })
        .withMessage('La ville doit contenir au moins 2 caractères'),
    body('customerInfo.country')
        .if(body('delivery.method').equals('home').or(body('delivery.method').equals('relay')))
        .notEmpty()
        .withMessage('Le pays est requis')
        .isIn(['FR'])
        .withMessage('Pays non supporté'),
    body('delivery.method')
        .notEmpty()
        .withMessage('Le mode de livraison est requis')
        .isIn(['home', 'relay', 'hand_delivery'])
        .withMessage('Mode de livraison invalide'),
    body('delivery.price')
        .isInt({ min: 0 })
        .withMessage('Le prix de livraison doit être positif')
];

// Route pour créer une session de précommande Oracle
router.post('/create-checkout-session', validatePreorder, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Erreur de validation',
                errors: errors.array()
            });
        }

        const { items, customerInfo, delivery } = req.body;

        // Valider les items
        const validatedItems = [];
        let productPrice = 0;

        for (const item of items) {
            const { offer, quantity } = item;

            // Valider l'offre
            if (!OFFERS[offer]) {
                return res.status(400).json({
                    success: false,
                    message: `Offre invalide: ${offer}`
                });
            }

            // Validation de la quantité
            const orderQuantity = parseInt(quantity);
            if (isNaN(orderQuantity) || orderQuantity < 1 || orderQuantity > 10) {
                return res.status(400).json({
                    success: false,
                    message: `Quantité invalide pour l'offre ${offer}`
                });
            }

            // Ajouter l'item validé
            validatedItems.push({
                offer: OFFERS[offer],
                quantity: orderQuantity
            });

            // Calculer le prix total des produits
            productPrice += OFFERS[offer].price * orderQuantity;
        }

        // Calculer le poids total de la commande
        const totalWeight = calculateTotalWeight(items);
        
        // Recalculer le tarif de livraison côté serveur (source de vérité)
        const calculatedDeliveryPrice = calculateDeliveryPrice(totalWeight, delivery.method);
        
        // Valider que le prix envoyé correspond au prix calculé
        if (delivery.price !== calculatedDeliveryPrice) {
            return res.status(400).json({
                success: false,
                message: 'Incohérence dans le prix de livraison',
                expected: calculatedDeliveryPrice,
                received: delivery.price
            });
        }

        // Utiliser le prix de livraison calculé par le serveur
        const shippingPrice = calculatedDeliveryPrice;
        const totalAmount = productPrice + shippingPrice;

        // Créer la session Stripe Checkout
        const session = await stripeService.createPreorderSession({
            items: validatedItems,
            customerInfo: customerInfo,
            delivery: delivery,
            productPrice,
            shippingPrice,
            totalAmount
        });

        res.json({
            success: true,
            sessionId: session.id,
            message: 'Session de paiement créée avec succès'
        });

    } catch (error) {
        console.error('Erreur création session paiement:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la session de paiement'
        });
    }
});

// Route webhook pour Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error('STRIPE_WEBHOOK_SECRET non configuré');
            return res.status(500).json({ error: 'Configuration webhook manquante' });
        }

        let event;

        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error('Erreur webhook Stripe:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Traiter les événements
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                console.log('Session complétée:', session.id);
                
                // Ici vous pouvez :
                // - Envoyer un email de confirmation
                // - Mettre à jour votre base de données
                // - Traiter la commande
                
                break;
                
            case 'payment_intent.succeeded':
                console.log('Paiement réussi:', event.data.object.id);
                break;
                
            case 'payment_intent.payment_failed':
                console.log('Paiement échoué:', event.data.object.id);
                break;
                
            default:
                console.log(`Événement non traité: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Erreur webhook:', error);
        res.status(500).json({ error: 'Erreur webhook' });
    }
});

module.exports = router;
