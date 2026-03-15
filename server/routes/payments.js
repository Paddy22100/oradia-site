const express = require('express');
const { body, validationResult } = require('express-validator');
const stripeService = require('../services/stripeService');
const { checkFreemiumAccess, useTraverseeCredit, associateDeviceToUser } = require('../middleware/freemium');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

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
    console.error('Erreur création session Traversée:', error);
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
    console.error('Erreur création session Tore:', error);
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
    console.error('Erreur vérification statut:', error);
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
    console.error('Erreur annulation abonnement:', error);
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
    console.error('Erreur webhook Stripe:', error);
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
    console.error('Erreur utilisation crédit:', error);
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
    console.error('Erreur association appareil:', error);
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
