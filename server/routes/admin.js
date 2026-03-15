const express = require('express');
const { authenticate, requireAdmin, logActivity } = require('../middleware/auth');
const User = require('../models/User');
const Tirage = require('../models/Tirage');
const Feedback = require('../models/Feedback');
const Newsletter = require('../models/Newsletter');
const moment = require('moment');

const router = express.Router();

// Toutes les routes admin nécessitent une authentification et le rôle admin
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/dashboard - Vue d'ensemble du dashboard
router.get('/dashboard', logActivity('dashboard_view'), async (req, res) => {
  try {
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Statistiques utilisateurs
    const userStats = await User.getStats();
    
    // Statistiques tirages
    const tirageStats7Days = await Tirage.getStats(last7Days, now);
    const tirageStats30Days = await Tirage.getStats(last30Days, now);
    const tirageStats90Days = await Tirage.getStats(last90Days, now);

    // Statistiques feedbacks
    const feedbackStats = await Feedback.getStats(last30Days, now);

    // Statistiques newsletter
    const newsletterStats = await Newsletter.getStats();

    // Derniers utilisateurs inscrits
    const recentUsers = await User.find({ isActive: true })
      .select('firstName lastName email role createdAt subscriptionActive')
      .sort({ createdAt: -1 })
      .limit(5);

    // Derniers feedbacks
    const recentFeedbacks = await Feedback.getRecentFeedbacks(5);

    // Derniers tirages
    const recentTirages = await Tirage.find({ isActive: true })
      .populate('userId', 'firstName lastName email')
      .select('type date status feedback.rating')
      .sort({ date: -1 })
      .limit(5);

    // Évolution quotidienne des tirages (30 derniers jours)
    const dailyTirageStats = await Tirage.getDailyStats(30);

    // Top utilisateurs
    const topUsers = await Tirage.getTopUsers(5);

    // Distribution des rôles
    const roleDistribution = await User.getRoleDistribution();

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers: userStats.totalUsers,
          activeUsers: userStats.activeUsers,
          totalMembers: userStats.totalMembers,
          newUsersThisMonth: userStats.newUsersThisMonth,
          totalTirages7Days: tirageStats7Days.totalTirages,
          totalTirages30Days: tirageStats30Days.totalTirages,
          totalTirages90Days: tirageStats90Days.totalTirages,
          totalRevenue30Days: tirageStats30Days.totalRevenue,
          totalFeedbacks: feedbackStats.totalFeedbacks,
          averageRating: feedbackStats.averageRating,
          synchroniciteRate: feedbackStats.synchroniciteRate,
          totalSubscribers: newsletterStats.totalSubscribers,
          activeSubscribers: newsletterStats.activeSubscribers,
          avgOpenRate: newsletterStats.avgOpenRate,
          avgClickRate: newsletterStats.avgClickRate
        },
        evolution: {
          tirageStats: {
            last7Days: tirageStats7Days,
            last30Days: tirageStats30Days,
            last90Days: tirageStats90Days
          },
          dailyStats: dailyTirageStats,
          roleDistribution: roleDistribution
        },
        recent: {
          users: recentUsers,
          feedbacks: recentFeedbacks,
          tirages: recentTirages
        },
        topUsers: topUsers
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur dashboard admin:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/admin/users - Liste des utilisateurs avec filtres
router.get('/users', logActivity('users_list'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      role = '',
      subscriptionActive = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate = '',
      endDate = ''
    } = req.query;

    // Construire le filtre
    const filter = { isActive: true };

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      filter.role = role;
    }

    if (subscriptionActive !== '') {
      filter.subscriptionActive = subscriptionActive === 'true';
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Trier
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetPasswordToken -emailVerificationToken')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('stats'),
      User.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur liste utilisateurs:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des utilisateurs',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/admin/users/:id - Détails d'un utilisateur
router.get('/users/:id', logActivity('user_detail'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -emailVerificationToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Récupérer les tirages de l'utilisateur
    const tirages = await Tirage.find({ userId: user._id })
      .sort({ date: -1 })
      .limit(10);

    // Récupérer les feedbacks de l'utilisateur
    const feedbacks = await Feedback.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    // Statistiques détaillées
    const stats = await user.updateStats();

    res.json({
      success: true,
      data: {
        user,
        tirages,
        feedbacks,
        stats
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur détail utilisateur:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des détails utilisateur',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// PUT /api/admin/users/:id - Modifier un utilisateur
router.put('/users/:id', logActivity('user_update'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const {
      firstName,
      lastName,
      email,
      role,
      subscriptionActive,
      subscriptionType,
      subscriptionExpiresAt,
      adminNotes,
      isActive
    } = req.body;

    // Mettre à jour les champs autorisés
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email && email !== user.email) {
      // Vérifier l'unicité de l'email
      const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Cet email est déjà utilisé'
        });
      }
      user.email = email;
    }
    if (role) user.role = role;
    if (subscriptionActive !== undefined) user.subscriptionActive = subscriptionActive;
    if (subscriptionType) user.subscriptionType = subscriptionType;
    if (subscriptionExpiresAt) user.subscriptionExpiresAt = new Date(subscriptionExpiresAt);
    if (adminNotes !== undefined) user.adminNotes = adminNotes;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    res.json({
      success: true,
      message: 'Utilisateur mis à jour avec succès',
      data: {
        user: user.toJSON()
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur modification utilisateur:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification de l\'utilisateur',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// DELETE /api/admin/users/:id - Désactiver un utilisateur
router.delete('/users/:id', logActivity('user_delete'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Soft delete
    user.isActive = false;
    user.deletedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Utilisateur désactivé avec succès'
    });

  } catch (error) {
    // console.error(console.error('Erreur suppression utilisateur:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la désactivation de l\'utilisateur',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/admin/analytics - Statistiques avancées
router.get('/analytics', logActivity('analytics_view'), async (req, res) => {
  try {
    const { period = '30', startDate, endDate } = req.query;

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

    // Statistiques globales
    const [
      userStats,
      tirageStats,
      feedbackStats,
      newsletterStats
    ] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            newUsers: { $sum: 1 },
            byRole: {
              $push: {
                role: '$role',
                count: 1
              }
            }
          }
        }
      ]),
      Tirage.getStats(start, end),
      Feedback.getStats(start, end),
      Newsletter.getStats()
    ]);

    // Évolution quotidienne
    const dailyStats = await Promise.all([
      Tirage.getDailyStats(parseInt(period)),
      User.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            newUsers: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Répartition des tirages par type
    const tirageDistribution = await Tirage.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.amount' }
        }
      }
    ]);

    // Taux de conversion
    const conversionStats = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
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
      Tirage.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
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

    res.json({
      success: true,
      data: {
        period: { start, end },
        overview: {
          users: userStats[0] || { newUsers: 0, byRole: [] },
          tirages: tirageStats,
          feedbacks: feedbackStats,
          newsletter: newsletterStats
        },
        evolution: {
          daily: dailyStats[0],
          users: dailyStats[1]
        },
        distribution: {
          tirages: tirageDistribution
        },
        conversions: {
          userToTirage: conversionStats[0] ? 
            (conversionStats[0].usersWithTirages / conversionStats[0].totalUsers * 100).toFixed(2) : 0,
          tirageToFeedback: conversionStats[1] ? 
            (conversionStats[1].tiragesWithFeedbacks / conversionStats[1].totalTirages * 100).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur analytics:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement des statistiques',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/admin/export/users - Export CSV des utilisateurs
router.get('/export/users', logActivity('export_users'), async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select('firstName lastName email role createdAt subscriptionActive stats.tiragesCount')
      .sort({ createdAt: -1 });

    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    const path = require('path');
    const fs = require('fs');

    const csvPath = path.join(__dirname, '../exports', `users_${Date.now()}.csv`);
    
    // Créer le répertoire exports s'il n'existe pas
    const exportsDir = path.dirname(csvPath);
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const csvWriter = createCsvWriter({
      path: csvPath,
      header: [
        { id: 'firstName', title: 'Prénom' },
        { id: 'lastName', title: 'Nom' },
        { id: 'email', title: 'Email' },
        { id: 'role', title: 'Rôle' },
        { id: 'createdAt', title: 'Date d\'inscription' },
        { id: 'subscriptionActive', title: 'Abonnement actif' },
        { id: 'tiragesCount', title: 'Nombre de tirages' }
      ]
    });

    const records = users.map(user => ({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      createdAt: moment(user.createdAt).format('DD/MM/YYYY HH:mm'),
      subscriptionActive: user.subscriptionActive ? 'Oui' : 'Non',
      tiragesCount: user.stats.tiragesCount
    }));

    await csvWriter.writeRecords(records);

    res.download(csvPath, `oradia_users_${moment().format('YYYY-MM-DD')}.csv`);

  } catch (error) {
    // console.error(console.error('Erreur export utilisateurs:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export des utilisateurs',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
