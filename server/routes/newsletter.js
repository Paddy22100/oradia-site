const express = require('express');
const { authenticate, requireAdmin, logActivity } = require('../middleware/auth');
const Newsletter = require('../models/Newsletter');
const User = require('../models/User');

const router = express.Router();

// GET /api/newsletter/subscribers - Liste des abonnés (admin)
router.get('/subscribers', authenticate, requireAdmin, logActivity('newsletter_subscribers'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      segment = '',
      active = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construire le filtre
    const filter = {};

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (segment) {
      filter.segments = segment;
    }

    if (active !== '') {
      filter.active = active === 'true';
    }

    // Trier
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [subscribers, total] = await Promise.all([
      Newsletter.find(filter)
        .populate('userId', 'firstName lastName role')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Newsletter.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        subscribers,
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Erreur liste abonnés:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des abonnés',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/newsletter/subscribe - S'abonner à la newsletter
router.post('/subscribe', logActivity('newsletter_subscribe'), async (req, res) => {
  try {
    const { email, userId, consentements, source = 'footer_signup' } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'L\'email est requis'
      });
    }

    // Vérifier si l'email existe déjà
    const existingSubscriber = await Newsletter.findOne({ email });
    if (existingSubscriber) {
      if (existingSubscriber.active) {
        return res.status(400).json({
          success: false,
          message: 'Cet email est déjà abonné'
        });
      } else {
        // Réactiver l'abonnement
        existingSubscriber.active = true;
        existingSubscriber.unsubscribeAt = undefined;
        existingSubscriber.unsubscribeReason = undefined;
        await existingSubscriber.save();

        return res.json({
          success: true,
          message: 'Abonnement réactivé avec succès',
          data: {
            subscriber: existingSubscriber
          }
        });
      }
    }

    // Créer le nouvel abonné
    const subscriber = new Newsletter({
      email,
      userId,
      source,
      segments: ['visitors'],
      preferences: {
        frequency: 'weekly',
        contentTypes: consentements?.newsletter ? ['newsletter_general'] : [],
        language: 'fr'
      },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        device: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop'
      }
    });

    await subscriber.save();

    res.status(201).json({
      success: true,
      message: 'Abonnement créé avec succès',
      data: {
        subscriber
      }
    });

  } catch (error) {
    console.error('Erreur abonnement newsletter:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà abonné'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'abonnement',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// PUT /api/newsletter/unsubscribe - Se désabonner
router.put('/unsubscribe', logActivity('newsletter_unsubscribe'), async (req, res) => {
  try {
    const { email, reason } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'L\'email est requis'
      });
    }

    const subscriber = await Newsletter.findOne({ email });

    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: 'Aucun abonnement trouvé pour cet email'
      });
    }

    await subscriber.unsubscribe(reason || 'Demande utilisateur');

    res.json({
      success: true,
      message: 'Désabonnement effectué avec succès'
    });

  } catch (error) {
    console.error('Erreur désabonnement newsletter:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du désabonnement',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/newsletter/stats - Statistiques newsletter
router.get('/stats', authenticate, requireAdmin, logActivity('newsletter_stats'), async (req, res) => {
  try {
    const stats = await Newsletter.getStats();

    // Statistiques des segments
    const segmentStats = await Newsletter.getSegmentStats();

    // Top abonnés engagés
    const topSubscribers = await Newsletter.getTopEngagedSubscribers(10);

    // Récent désabonnés
    const recentUnsubscribes = await Newsletter.getRecentUnsubscribes(10);

    res.json({
      success: true,
      data: {
        overview: stats,
        segments: segmentStats,
        topSubscribers,
        recentUnsubscribes
      }
    });

  } catch (error) {
    console.error('Erreur stats newsletter:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/newsletter/campaign - Créer une campagne (admin)
router.post('/campaign', authenticate, requireAdmin, logActivity('newsletter_campaign_create'), async (req, res) => {
  try {
    const {
      name,
      subject,
      content,
      segments = [],
      sendAt,
      template = 'general'
    } = req.body;

    if (!name || !subject || !content) {
      return res.status(400).json({
        success: false,
        message: 'Nom, sujet et contenu sont requis'
      });
    }

    // Logique de création de campagne (à implémenter)
    // Pour l'instant, on retourne un succès

    res.status(201).json({
      success: true,
      message: 'Campagne créée avec succès',
      data: {
        campaign: {
          id: new Date().getTime(),
          name,
          subject,
          template,
          segments,
          status: 'draft',
          createdAt: new Date()
        }
      }
    });

  } catch (error) {
    console.error('Erreur création campagne:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la campagne',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/newsletter/send - Envoyer une campagne (admin)
router.post('/send', authenticate, requireAdmin, logActivity('newsletter_send'), async (req, res) => {
  try {
    const { campaignId, testMode = false, testEmails = [] } = req.body;

    // Logique d'envoi de campagne (à implémenter avec le service email)
    // Pour l'instant, on simule l'envoi

    const subscribers = await Newsletter.find({ active: true });
    
    if (testMode && testEmails.length > 0) {
      // Mode test : envoyer uniquement aux emails de test
      console.log('Mode test - envoi à:', testEmails);
    } else {
      // Mode production : envoyer à tous les abonnés
      console.log(`Envoi campagne ${campaignId} à ${subscribers.length} abonnés`);
    }

    res.json({
      success: true,
      message: testMode ? 
        'Campagne envoyée en mode test avec succès' : 
        'Campagne envoyée avec succès',
      data: {
        sentCount: testMode ? testEmails.length : subscribers.length,
        sentAt: new Date()
      }
    });

  } catch (error) {
    console.error('Erreur envoi campagne:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi de la campagne',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// PUT /api/newsletter/subscribers/:id/preferences - Mettre à jour les préférences
router.put('/subscribers/:id/preferences', authenticate, logActivity('newsletter_preferences_update'), async (req, res) => {
  try {
    const { frequency, contentTypes, language, emailNotifications } = req.body;

    const subscriber = await Newsletter.findById(req.params.id);

    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: 'Abonné non trouvé'
      });
    }

    // Vérifier les permissions
    if (req.user.role !== 'admin' && subscriber.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    // Mettre à jour les préférences
    if (frequency) subscriber.preferences.frequency = frequency;
    if (contentTypes) subscriber.preferences.contentTypes = contentTypes;
    if (language) subscriber.preferences.language = language;
    if (emailNotifications !== undefined) subscriber.preferences.emailNotifications = emailNotifications;

    await subscriber.save();

    res.json({
      success: true,
      message: 'Préférences mises à jour avec succès',
      data: {
        preferences: subscriber.preferences
      }
    });

  } catch (error) {
    console.error('Erreur mise à jour préférences newsletter:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour des préférences',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// DELETE /api/newsletter/subscribers/:id - Supprimer un abonné (admin)
router.delete('/subscribers/:id', authenticate, requireAdmin, logActivity('newsletter_subscriber_delete'), async (req, res) => {
  try {
    const subscriber = await Newsletter.findById(req.params.id);

    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: 'Abonné non trouvé'
      });
    }

    // Soft delete
    subscriber.active = false;
    subscriber.deletedAt = new Date();
    await subscriber.save();

    res.json({
      success: true,
      message: 'Abonné supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression abonné:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de l\'abonné',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
