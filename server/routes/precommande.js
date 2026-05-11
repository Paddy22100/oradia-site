const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const supabaseService = require('../services/supabaseService');
const brevoService = require('../services/brevoService');

/**
 * @route   POST /api/precommande/subscribe
 * @desc    Inscription à la liste de précommande
 * @access  Public
 */
router.post('/subscribe',
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Email invalide'),
        body('name')
            .optional()
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('Le nom doit contenir entre 2 et 100 caractères')
    ],
    async (req, res) => {
        try {
            // Validation des données
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Données invalides',
                    errors: errors.array()
                });
            }

            const { email, name } = req.body;
            const ip = req.ip || req.connection.remoteAddress;
            const userAgent = req.get('user-agent') || 'Unknown';

            // Vérifier si l'email existe déjà
            const existingSubscriber = await supabaseService.findSubscriberByEmail(email);
            
            if (existingSubscriber) {
                return res.status(200).json({
                    success: true,
                    message: 'Vous êtes déjà inscrit à la précommande.',
                    alreadySubscribed: true
                });
            }

            // Créer l'inscription dans Supabase
            const subscriber = await supabaseService.createSubscriber({
                email,
                name: name || null,
                ip_address: ip,
                user_agent: userAgent,
                source: 'precommande-oracle',
                status: 'pending'
            });

            // Envoyer l'email de confirmation via Brevo
            let emailSent = false;
            try {
                await brevoService.sendPrecommandeConfirmation({
                    email,
                    name: name || 'Cher(e) inscrit(e)'
                });
                emailSent = true;

                // Mettre à jour le statut à 'confirmed'
                await supabaseService.updateSubscriberStatus(subscriber.id, 'confirmed');
            } catch (emailError) {
                console.error('Erreur envoi email Brevo:', emailError);
                // L'inscription est créée même si l'email échoue
            }

            // Enregistrer l'événement analytics
            try {
                await supabaseService.logEvent({
                    event_type: 'precommande_subscription',
                    email,
                    metadata: {
                        name,
                        emailSent,
                        source: 'precommande-oracle'
                    }
                });
            } catch (analyticsError) {
                console.error('Erreur analytics:', analyticsError);
            }

            return res.status(201).json({
                success: true,
                message: emailSent 
                    ? 'Inscription confirmée ! Un email de confirmation vous a été envoyé.'
                    : 'Inscription enregistrée. L\'email de confirmation sera envoyé prochainement.',
                emailSent,
                subscriber: {
                    id: subscriber.id,
                    email: subscriber.email,
                    created_at: subscriber.created_at
                }
            });

        } catch (error) {
            console.error('Erreur inscription précommande:', error);
            return res.status(500).json({
                success: false,
                message: 'Une erreur est survenue lors de l\'inscription. Veuillez réessayer.',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

/**
 * @route   GET /api/precommande/stats
 * @desc    Statistiques des inscriptions (admin)
 * @access  Private (Admin)
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await supabaseService.getSubscriptionStats();
        
        return res.status(200).json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Erreur stats précommande:', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques'
        });
    }
});

/**
 * @route   POST /api/precommande/unsubscribe
 * @desc    Désinscription de la liste
 * @access  Public
 */
router.post('/unsubscribe',
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Email invalide')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Email invalide'
                });
            }

            const { email } = req.body;
            
            await supabaseService.updateSubscriberStatus(email, 'unsubscribed');

            return res.status(200).json({
                success: true,
                message: 'Désinscription effectuée avec succès.'
            });

        } catch (error) {
            console.error('Erreur désinscription:', error);
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de la désinscription'
            });
        }
    }
);

module.exports = router;
