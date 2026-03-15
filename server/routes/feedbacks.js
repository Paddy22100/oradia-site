const express = require('express');
const { authenticate, requireAdmin, logActivity } = require('../middleware/auth');
const Feedback = require('../models/Feedback');
const Tirage = require('../models/Tirage');

const router = express.Router();

// GET /api/feedbacks - Liste des feedbacks (admin)
router.get('/', authenticate, requireAdmin, logActivity('feedbacks_list'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      rating,
      synchronicite,
      status,
      category,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construire le filtre
    const filter = {};

    if (rating) filter.rating = parseInt(rating);
    if (synchronicite !== undefined) filter.synchronicite = synchronicite === 'true';
    if (status) filter.status = status;
    if (category) filter.categories = category;

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

    const [feedbacks, total] = await Promise.all([
      Feedback.find(filter)
        .populate('userId', 'firstName lastName email')
        .populate('tirageId', 'type date')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Feedback.countDocuments(filter)
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
    // console.error(console.error('Erreur liste feedbacks:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des feedbacks',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/feedbacks/:id - Détails d'un feedback
router.get('/:id', authenticate, logActivity('feedback_detail'), async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id)
      .populate('userId', 'firstName lastName email role')
      .populate('tirageId', 'type date intention cards');

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback non trouvé'
      });
    }

    // Vérifier les permissions
    if (req.user.role !== 'admin' && feedback.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    res.json({
      success: true,
      data: {
        feedback
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur détail feedback:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// PUT /api/feedbacks/:id/moderate - Modérer un feedback (admin)
router.put('/:id/moderate', authenticate, requireAdmin, logActivity('feedback_moderate'), async (req, res) => {
  try {
    const { status, moderationReason } = req.body;

    if (!['approved', 'rejected', 'hidden', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Statut de modération invalide'
      });
    }

    const feedback = await Feedback.findById(req.params.id);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback non trouvé'
      });
    }

    feedback.status = status;
    feedback.moderatedBy = req.user._id;
    feedback.moderatedAt = new Date();
    
    if (moderationReason) {
      feedback.moderationReason = moderationReason;
    }

    await feedback.save();

    res.json({
      success: true,
      message: 'Feedback modéré avec succès',
      data: {
        feedback
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur modération feedback:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modération du feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// DELETE /api/feedbacks/:id - Supprimer un feedback (admin)
router.delete('/:id', authenticate, requireAdmin, logActivity('feedback_delete'), async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback non trouvé'
      });
    }

    // Soft delete
    feedback.isActive = false;
    feedback.deletedAt = new Date();
    await feedback.save();

    res.json({
      success: true,
      message: 'Feedback supprimé avec succès'
    });

  } catch (error) {
    // console.error(console.error('Erreur suppression feedback:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/feedbacks/stats - Statistiques des feedbacks
router.get('/stats', authenticate, logActivity('feedbacks_stats'), async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const stats = await Feedback.getStats(startDate, now);

    res.json({
      success: true,
      data: {
        period: { days, startDate, endDate: now },
        stats
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur stats feedbacks:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/feedbacks/recent - Feedbacks récents
router.get('/recent', authenticate, logActivity('feedbacks_recent'), async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const feedbacks = await Feedback.getRecentFeedbacks(parseInt(limit));

    res.json({
      success: true,
      data: {
        feedbacks
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur feedbacks récents:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des feedbacks récents',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/feedbacks/improvements - Suggestions d'amélioration
router.get('/improvements', authenticate, logActivity('feedbacks_improvements'), async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const suggestions = await Feedback.getImprovementSuggestions(parseInt(limit));

    res.json({
      success: true,
      data: {
        suggestions
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur suggestions amélioration:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des suggestions',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
