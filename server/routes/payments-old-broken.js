const express = require('express');
const { body, validationResult } = require('express-validator');
const stripeService = require('../services/stripeService');
const { checkFreemiumAccess, useTraverseeCredit, associateDeviceToUser } = require('../middleware/freemium');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Configuration des offres et frais de livraison
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
        price: 5200, // 52€ en centimes (corrigé)
        description: 'Exemplaire unique et dédicacé'
    }
};

const SHIPPING_FRANCE = 690; // 6.90€ en centimes

// Validation rules pour la précommande
const preorderValidation = [
    body('items')
        .isArray({ min: 1 })
        .withMessage('Le panier doit contenir au moins un article'),
    body('items.*.offer')
        .notEmpty()
        .withMessage('L\'offre est requise')
        .isIn(Object.keys(OFFERS))
        .withMessage('Offre invalide'),
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

// Route pour créer une session de précommande Oracle
router.post('/create-checkout-session', async (req, res) => {
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

        // Appeler le service Stripe pour créer la session
        const session = await stripeService.createPreorderSession(items, customerInfo, delivery);

        res.json({
            success: true,
            sessionId: session.id,
            message: 'Session de paiement créée avec succès'
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

        if (session.success) {
            res.json({
                success: true,
                sessionId: session.sessionId,
                url: session.url
            });
        } else {
            res.status(400).json({
                success: false,
                message: session.error || 'Erreur lors de la création de la session'
            });
        }
    } catch (error) {
        console.error('Erreur création session précommande:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// Route pour créer une session de paiement Traversée
router.post('/create-traversee-session', authenticate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: errors.array()
      });
    }

    const { userId } = req.user;
    const result = await stripeService.createTraverseeSession(userId, req.user.email);

    if (result.success) {
      res.json({
        success: true,
        sessionId: result.sessionId,
        url: result.url
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    // console.error(console.error('Erreur création session Traversée:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Route pour créer une session d'abonnement Tore
router.post('/create-tore-session', authenticate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: errors.array()
      });
    }

    const { userId } = req.user;
    const result = await stripeService.createToreSession(userId, req.user.email);

    if (result.success) {
      res.json({
        success: true,
        sessionId: result.sessionId,
        url: result.url
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    // console.error(console.error('Erreur création session Tore:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Route pour vérifier le statut de l'utilisateur
router.get('/user-status', authenticate, async (req, res) => {
  try {
    const status = await stripeService.getUserStatus(req.user._id);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    // console.error(console.error('Erreur vérification statut:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Route pour annuler un abonnement
router.post('/cancel-subscription', authenticate, async (req, res) => {
  try {
    const result = await stripeService.cancelSubscription(req.user._id);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    // console.error(console.error('Erreur annulation abonnement:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Route webhook Stripe (doit être la dernière route)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const result = await stripeService.handleWebhook(sig, req.body);
    
    if (result.success) {
      res.json({ received: true });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    // console.error(console.error('Erreur webhook Stripe:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Route pour utiliser un crédit Traversée
router.post('/use-traversee-credit', authenticate, async (req, res) => {
  try {
    const result = await useTraverseeCredit(req.user._id);
    
    if (result.success) {
      res.json({
        success: true,
        remainingCredits: result.remainingCredits
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    // console.error(console.error('Erreur utilisation crédit:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Route pour associer un appareil à un utilisateur (après inscription)
router.post('/associate-device', authenticate, async (req, res) => {
  try {
    const result = await associateDeviceToUser(req, req.user._id);
    
    res.json({
      success: true,
      message: 'Appareil associé avec succès'
    });
  } catch (error) {
    // console.error(console.error('Erreur association appareil:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Validation rules
const createSessionValidation = [
  body('userId')
    .notEmpty()
    .withMessage('L\'ID utilisateur est requis')
];

module.exports = router;
