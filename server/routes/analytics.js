const express = require('express');
const { authenticate, requireAdmin, logActivity } = require('../middleware/auth');
const User = require('../models/User');
const Tirage = require('../models/Tirage');
const Feedback = require('../models/Feedback');
const Newsletter = require('../models/Newsletter');
const moment = require('moment');

const router = express.Router();

// Middleware admin requis pour toutes les routes analytics
router.use(authenticate);
router.use(requireAdmin);

// GET /api/analytics/overview - Vue d'ensemble des analytics
router.get('/overview', logActivity('analytics_overview'), async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Statistiques globales
    const [
      userGrowth,
      tirageStats,
      feedbackStats,
      newsletterStats,
      revenueStats
    ] = await Promise.all([
      // Croissance des utilisateurs
      User.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: now } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            newUsers: { $sum: 1 },
            totalUsers: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Statistiques des tirages
      Tirage.getStats(startDate, now),
      
      // Statistiques des feedbacks
      Feedback.getStats(startDate, now),
      
      // Statistiques newsletter
      Newsletter.getStats(),
      
      // Statistiques de revenus
      Tirage.aggregate([
        { $match: { date: { $gte: startDate, $lte: now }, 'pricing.paid': true } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            dailyRevenue: { $sum: '$pricing.amount' },
            paidTirages: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Taux de conversion
    const conversionStats = await Promise.all([
      // Visiteurs → Inscription
      User.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: now } } },
        {
          $group: {
            _id: null,
            totalNewUsers: { $sum: 1 }
          }
        }
      ]),
      
      // Inscription → Premier tirage
      User.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: now } } },
        {
          $lookup: {
            from: 'tirages',
            localField: '_id',
            foreignField: 'userId',
            as: 'tirages'
          }
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            usersWithTirages: {
              $sum: { $cond: [{ $gt: [{ $size: '$tirages' }, 0] }, 1, 0] }
            }
          }
        }
      ]),
      
      // Tirage → Feedback
      Tirage.aggregate([
        { $match: { date: { $gte: startDate, $lte: now } } },
        {
          $lookup: {
            from: 'feedbacks',
            localField: '_id',
            foreignField: 'tirageId',
            as: 'feedbacks'
          }
        },
        {
          $group: {
            _id: null,
            totalTirages: { $sum: 1 },
            tiragesWithFeedbacks: {
              $sum: { $cond: [{ $gt: [{ $size: '$feedbacks' }, 0] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    // Pages les plus visitées (simulation - à implémenter avec un vrai tracking)
    const pageViews = [
      { page: '/index.html', views: 1250, unique: 890 },
      { page: '/pelerin.html', views: 890, unique: 650 },
      { page: '/accompagnements.html', views: 450, unique: 320 },
      { page: '/a-propos.html', views: 380, unique: 280 },
      { page: '/rendez-vous.html', views: 320, unique: 240 }
    ];

    res.json({
      success: true,
      data: {
        period: { days, startDate, endDate: now },
        growth: {
          users: userGrowth,
          revenue: revenueStats
        },
        stats: {
          tirages: tirageStats,
          feedbacks: feedbackStats,
          newsletter: newsletterStats
        },
        conversions: {
          visitorsToSignups: conversionStats[0] ? conversionStats[0].totalNewUsers : 0,
          signupsToFirstTirage: conversionStats[1] ? 
            (conversionStats[1].usersWithTirages / conversionStats[1].totalUsers * 100).toFixed(1) : 0,
          tirageToFeedback: conversionStats[2] ? 
            (conversionStats[2].tiragesWithFeedbacks / conversionStats[2].totalTirages * 100).toFixed(1) : 0
        },
        pageViews
      }
    });

  } catch (error) {
    console.error('Erreur analytics overview:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement des analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/analytics/tirages - Analytics des tirages
router.get('/tirages', logActivity('analytics_tirages'), async (req, res) => {
  try {
    const { period = '30', type, startDate, endDate } = req.query;

    // Déterminer la période
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      const days = parseInt(period);
      end = new Date();
      start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    }

    // Statistiques générales
    const generalStats = await Tirage.getStats(start, end);

    // Répartition par type
    const typeDistribution = await Tirage.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.amount' },
          averageRating: { $avg: '$feedback.rating' },
          synchroniciteRate: {
            $avg: { $cond: [{ $eq: ['$feedback.synchronicite', true] }, 1, 0] }
          }
        }
      }
    ]);

    // Évolution quotidienne
    const dailyEvolution = await Tirage.getDailyStats(parseInt(period));

    // Top utilisateurs
    const topUsers = await Tirage.getTopUsers(10);

    // Taux d'abandon par type
    const abandonmentStats = await Tirage.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { type: '$type', status: '$status' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          total: { $sum: '$count' },
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count'
            }
          }
        }
      }
    ]);

    // Temps moyen par type de tirage
    const durationStats = await Tirage.aggregate([
      { $match: { date: { $gte: start, $lte: end }, 'metadata.duration': { $gt: 0 } } },
      {
        $group: {
          _id: '$type',
          averageDuration: { $avg: '$metadata.duration' },
          minDuration: { $min: '$metadata.duration' },
          maxDuration: { $max: '$metadata.duration' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Répartition des devices
    const deviceStats = await Tirage.aggregate([
      { $match: { date: { $gte: start, $lte: end }, 'metadata.device': { $exists: true } } },
      {
        $group: {
          _id: '$metadata.device',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: { start, end },
        general: generalStats,
        distribution: {
          types: typeDistribution,
          devices: deviceStats,
          abandonment: abandonmentStats,
          duration: durationStats
        },
        evolution: dailyEvolution,
        topUsers
      }
    });

  } catch (error) {
    console.error('Erreur analytics tirages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement des analytics des tirages',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/analytics/users - Analytics des utilisateurs
router.get('/users', logActivity('analytics_users'), async (req, res) => {
  try {
    const { period = '30', segment = 'all' } = req.query;
    const days = parseInt(period);
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Statistiques générales
    const userStats = await User.getStats();

    // Distribution des rôles
    const roleDistribution = await User.getRoleDistribution();

    // Évolution des inscriptions
    const registrationEvolution = await User.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: now } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          registrations: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Répartition par pays (simulation - à implémenter avec geoIP)
    const countryDistribution = [
      { country: 'France', users: 450, percentage: 72.5 },
      { country: 'Belgique', users: 65, percentage: 10.5 },
      { country: 'Suisse', users: 45, percentage: 7.3 },
      { country: 'Canada', users: 35, percentage: 5.6 },
      { country: 'Autres', users: 25, percentage: 4.1 }
    ];

    // Statistiques d'engagement
    const engagementStats = await Promise.all([
      // Utilisateurs actifs (tirages dans la période)
      User.aggregate([
        {
          $lookup: {
            from: 'tirages',
            localField: '_id',
            foreignField: 'userId',
            as: 'tirages'
          }
        },
        {
          $match: {
            'tirages.date': { $gte: startDate, $lte: now }
          }
        },
        {
          $group: {
            _id: null,
            activeUsers: { $sum: 1 }
          }
        }
      ]),
      
      // Utilisateurs avec feedbacks
      User.aggregate([
        {
          $lookup: {
            from: 'feedbacks',
            localField: '_id',
            foreignField: 'userId',
            as: 'feedbacks'
          }
        },
        {
          $match: {
            'feedbacks.createdAt': { $gte: startDate, $lte: now }
          }
        },
        {
          $group: {
            _id: null,
            usersWithFeedbacks: { $sum: 1 }
          }
        }
      ]),
      
      // Distribution du nombre de tirages par utilisateur
      User.aggregate([
        {
          $lookup: {
            from: 'tirages',
            localField: '_id',
            foreignField: 'userId',
            as: 'tirages'
          }
        },
        {
          $group: {
            _id: '$_id',
            tiragesCount: { $size: '$tirages' }
          }
        },
        {
          $group: {
            _id: '$tiragesCount',
            users: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Rétention (utilisateurs qui reviennent)
    const retentionStats = await User.aggregate([
      {
        $lookup: {
          from: 'tirages',
          localField: '_id',
          foreignField: 'userId',
          as: 'tirages'
        }
      },
      {
        $project: {
          userId: '$_id',
          email: 1,
          createdAt: 1,
          firstTirage: { $min: '$tirages.date' },
          lastTirage: { $max: '$tirages.date' },
          tiragesCount: { $size: '$tirages' }
        }
      },
      {
        $match: {
          tiragesCount: { $gt: 1 }
        }
      },
      {
        $group: {
          _id: null,
          returningUsers: { $sum: 1 },
          averageDaysBetweenTirages: {
            $avg: {
              $divide: [
                { $subtract: ['$lastTirage', '$firstTirage'] },
                1000 * 60 * 60 * 24 // Convertir en jours
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: { days, startDate, endDate: now },
        overview: userStats,
        distribution: {
          roles: roleDistribution,
          countries: countryDistribution
        },
        evolution: registrationEvolution,
        engagement: {
          activeUsers: engagementStats[0]?.activeUsers || 0,
          usersWithFeedbacks: engagementStats[1]?.usersWithFeedbacks || 0,
          tiragesDistribution: engagementStats[2] || []
        },
        retention: {
          returningUsers: retentionStats[0]?.returningUsers || 0,
          averageDaysBetweenTirages: Math.round(retentionStats[0]?.averageDaysBetweenTirages || 0)
        }
      }
    });

  } catch (error) {
    console.error('Erreur analytics users:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement des analytics utilisateurs',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/analytics/feedbacks - Analytics des feedbacks
router.get('/feedbacks', logActivity('analytics_feedbacks'), async (req, res) => {
  try {
    const { period = '30', category, rating } = req.query;
    const days = parseInt(period);
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Statistiques générales
    const generalStats = await Feedback.getStats(startDate, now);

    // Évolution des notes
    const ratingEvolution = await Feedback.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: now }, status: 'approved' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          averageRating: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Distribution des notes
    const ratingDistribution = await Feedback.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: now }, status: 'approved' } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Distribution par satisfaction
    const satisfactionDistribution = await Feedback.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: now }, status: 'approved' } },
      {
        $group: {
          _id: '$satisfaction',
          count: { $sum: 1 }
        }
      }
    ]);

    // Statistiques de synchronicité
    const synchroniciteStats = await Feedback.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: now }, status: 'approved' } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          synchroniciteYes: { $sum: { $cond: [{ $eq: ['$synchronicite', true] }, 1, 0] } },
          synchroniciteNo: { $sum: { $cond: [{ $eq: ['$synchronicite', false] }, 1, 0] } }
        }
      }
    ]);

    // Catégories les plus fréquentes
    const categoryStats = await Feedback.getCategoryStats();

    // Suggestions d'amélioration
    const improvementSuggestions = await Feedback.getImprovementSuggestions(10);

    // Feedbacks par type de tirage
    const tirageFeedbacks = await Feedback.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: now }, status: 'approved' } },
      {
        $lookup: {
          from: 'tirages',
          localField: 'tirageId',
          foreignField: '_id',
          as: 'tirage'
        }
      },
      {
        $group: {
          _id: { $arrayElemAt: ['$tirage.type', 0] },
          averageRating: { $avg: '$rating' },
          count: { $sum: 1 },
          synchroniciteRate: {
            $avg: { $cond: [{ $eq: ['$synchronicite', true] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: { days, startDate, endDate: now },
        general: generalStats,
        evolution: {
          ratings: ratingEvolution
        },
        distribution: {
          ratings: ratingDistribution,
          satisfaction: satisfactionDistribution,
          categories: categoryStats,
          tirageTypes: tirageFeedbacks
        },
        synchronicite: {
          ...synchroniciteStats[0],
          rate: synchroniciteStats[0] ? (synchroniciteStats[0].synchroniciteYes / synchroniciteStats[0].total * 100).toFixed(1) : 0
        },
        improvements: improvementSuggestions
      }
    });

  } catch (error) {
    console.error('Erreur analytics feedbacks:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement des analytics feedbacks',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
