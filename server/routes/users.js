const express = require('express');
const { authenticate, logActivity } = require('../middleware/auth');
const User = require('../models/User');
const Tirage = require('../models/Tirage');
const Feedback = require('../models/Feedback');
const moment = require('moment');

const router = express.Router();

// Toutes les routes utilisateurs nécessitent une authentification
router.use(authenticate);

// GET /api/users/profile - Obtenir le profil complet
router.get('/profile', logActivity('profile_view'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -resetPasswordToken -emailVerificationToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Mettre à jour les statistiques
    await user.updateStats();

    res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    console.error('Erreur get profile:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du profil',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/users/tirages - Historique des tirages
router.get('/tirages', logActivity('tirages_history'), async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;

    const filter = { userId: req.user._id, isActive: true };
    if (type) {
      filter.type = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tirages, total] = await Promise.all([
      Tirage.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Tirage.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        tirages,
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Erreur historique tirages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des tirages',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/users/tirages/:id - Détails d'un tirage
router.get('/tirages/:id', logActivity('tirage_detail'), async (req, res) => {
  try {
    const tirage = await Tirage.findOne({
      _id: req.params.id,
      userId: req.user._id,
      isActive: true
    });

    if (!tirage) {
      return res.status(404).json({
        success: false,
        message: 'Tirage non trouvé'
      });
    }

    res.json({
      success: true,
      data: {
        tirage
      }
    });

  } catch (error) {
    console.error('Erreur détail tirage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du tirage',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/users/tirages - Créer un nouveau tirage
router.post('/tirages', logActivity('tirage_create'), async (req, res) => {
  try {
    const {
      type,
      intention,
      cards,
      memoireCosmos,
      passerelles,
      synthese,
      pricing,
      metadata
    } = req.body;

    // Validation de base
    if (!type || !intention || !cards || !synthese) {
      return res.status(400).json({
        success: false,
        message: 'Données de tirage incomplètes'
      });
    }

    // Vérifier les permissions selon le type de tirage
    const user = await User.findById(req.user._id);
    
    if (type === 'tore' && !user.subscriptionActive) {
      return res.status(403).json({
        success: false,
        message: 'Abonnement requis pour les tirages du Tore',
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }

    if (type === 'traversee') {
      // Vérifier si l'utilisateur a des tirages disponibles
      // (logique à implémenter selon votre système de paiement)
    }

    // Créer le tirage
    const tirage = new Tirage({
      userId: req.user._id,
      type,
      intention,
      cards,
      memoireCosmos,
      passerelles,
      synthese,
      pricing: pricing || {
        amount: type === 'pelerin' ? 0 : type === 'traversee' ? 5 : 8,
        currency: 'EUR',
        paid: type === 'pelerin',
        paymentMethod: type === 'pelerin' ? 'free' : 'pending'
      },
      metadata: {
        ...metadata,
        device: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop',
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip
      }
    });

    await tirage.save();

    // Mettre à jour les stats de l'utilisateur
    await user.updateStats();

    res.status(201).json({
      success: true,
      message: 'Tirage créé avec succès',
      data: {
        tirage
      }
    });

  } catch (error) {
    console.error('Erreur création tirage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du tirage',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/users/feedback - Ajouter un feedback sur un tirage
router.post('/feedback', logActivity('feedback_create'), async (req, res) => {
  try {
    const {
      tirageId,
      rating,
      comment,
      satisfaction,
      pertinence,
      clarity,
      helpful,
      wouldRecommend,
      synchronicite,
      synchroniciteDetails,
      improvements,
      likedElements,
      dislikedElements
    } = req.body;

    // Validation
    if (!tirageId || !rating || !satisfaction || !pertinence || !clarity) {
      return res.status(400).json({
        success: false,
        message: 'Données de feedback incomplètes'
      });
    }

    // Vérifier que le tirage appartient à l'utilisateur
    const tirage = await Tirage.findOne({
      _id: tirageId,
      userId: req.user._id,
      isActive: true
    });

    if (!tirage) {
      return res.status(404).json({
        success: false,
        message: 'Tirage non trouvé'
      });
    }

    // Créer le feedback
    const feedback = new Feedback({
      userId: req.user._id,
      tirageId,
      rating,
      comment,
      satisfaction,
      pertinence,
      clarity,
      helpful,
      wouldRecommend,
      synchronicite,
      synchroniciteDetails,
      improvements: improvements || [],
      likedElements: likedElements || [],
      dislikedElements: dislikedElements || [],
      metadata: {
        device: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop',
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        responseTime: (new Date() - tirage.date) / (1000 * 60 * 60) // en heures
      }
    });

    await feedback.save();

    // Mettre à jour le feedback du tirage
    await tirage.addFeedback({
      rating,
      comment,
      satisfaction,
      pertinence,
      clarity,
      helpful,
      wouldRecommend,
      synchronicite,
      synchroniciteDetails,
      improvements
    });

    res.status(201).json({
      success: true,
      message: 'Feedback enregistré avec succès',
      data: {
        feedback
      }
    });

  } catch (error) {
    console.error('Erreur création feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement du feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/users/feedbacks - Historique des feedbacks
router.get('/feedbacks', logActivity('feedbacks_history'), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [feedbacks, total] = await Promise.all([
      Feedback.find({ userId: req.user._id, status: 'approved' })
        .populate('tirageId', 'type date')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Feedback.countDocuments({ userId: req.user._id, status: 'approved' })
    ]);

    res.json({
      success: true,
      data: {
        feedbacks,
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Erreur historique feedbacks:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des feedbacks',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/users/stats - Statistiques personnelles
router.get('/stats', logActivity('stats_view'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Statistiques des tirages
    const tirageStats = await Tirage.aggregate([
      { $match: { userId: req.user._id, isActive: true } },
      {
        $group: {
          _id: null,
          totalTirages: { $sum: 1 },
          tiragesPelerin: { $sum: { $cond: [{ $eq: ['$type', 'pelerin'] }, 1, 0] } },
          tiragesTraversee: { $sum: { $cond: [{ $eq: ['$type', 'traversee'] }, 1, 0] } },
          tiragesTore: { $sum: { $cond: [{ $eq: ['$type', 'tore'] }, 1, 0] } },
          totalSpent: { $sum: '$pricing.amount' },
          lastTirageDate: { $max: '$date' },
          averageRating: { $avg: '$feedback.rating' },
          synchroniciteCount: {
            $sum: { $cond: [{ $eq: ['$feedback.synchronicite', true] }, 1, 0] }
          }
        }
      }
    ]);

    // Évolution mensuelle
    const monthlyStats = await Tirage.aggregate([
      { $match: { userId: req.user._id, isActive: true } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          tiragesCount: { $sum: 1 },
          types: { $push: '$type' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Feedbacks récents
    const recentFeedbacks = await Feedback.find({ userId: req.user._id, status: 'approved' })
      .populate('tirageId', 'type date')
      .sort({ createdAt: -1 })
      .limit(5);

    const stats = tirageStats[0] || {
      totalTirages: 0,
      tiragesPelerin: 0,
      tiragesTraversee: 0,
      tiragesTore: 0,
      totalSpent: 0,
      lastTirageDate: null,
      averageRating: 0,
      synchroniciteCount: 0
    };

    res.json({
      success: true,
      data: {
        overview: {
          ...stats,
          synchroniciteRate: stats.totalTirages > 0 ? (stats.synchroniciteCount / stats.totalTirages * 100).toFixed(1) : 0,
          memberSince: user.createdAt,
          lastLogin: user.lastLogin,
          loginCount: user.loginCount
        },
        evolution: monthlyStats,
        recentFeedbacks
      }
    });

  } catch (error) {
    console.error('Erreur stats utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// PUT /api/users/preferences - Mettre à jour les préférences
router.put('/preferences', logActivity('preferences_update'), async (req, res) => {
  try {
    const {
      profile,
      consentements
    } = req.body;

    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Mettre à jour le profil
    if (profile) {
      user.profile = { ...user.profile, ...profile };
    }

    // Mettre à jour les consentements
    if (consentements) {
      user.consentements = { ...user.consentements, ...consentements };
    }

    await user.save();

    res.json({
      success: true,
      message: 'Préférences mises à jour avec succès',
      data: {
        preferences: {
          profile: user.profile,
          consentements: user.consentements
        }
      }
    });

  } catch (error) {
    console.error('Erreur mise à jour préférences:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour des préférences',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// DELETE /api/users/account - Supprimer le compte utilisateur
router.delete('/account', logActivity('account_delete'), async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe est requis pour supprimer le compte'
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe incorrect'
      });
    }

    // Soft delete
    user.isActive = false;
    user.deletedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Compte supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression compte:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du compte',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
