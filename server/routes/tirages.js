const express = require('express');
const { authenticate, requireAdmin, logActivity } = require('../middleware/auth');
const Tirage = require('../models/Tirage');
const User = require('../models/User');

const router = express.Router();

// GET /api/tirages - Liste des tirages (admin)
router.get('/', authenticate, requireAdmin, logActivity('tirages_list'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      userId,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Construire le filtre
    const filter = { isActive: true };

    if (type) filter.type = type;
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    // Trier
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tirages, total] = await Promise.all([
      Tirage.find(filter)
        .populate('userId', 'firstName lastName email')
        .sort(sort)
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
    // console.error(console.error('Erreur liste tirages:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des tirages',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/tirages/:id - Détails d'un tirage
router.get('/:id', authenticate, logActivity('tirage_detail'), async (req, res) => {
  try {
    const tirage = await Tirage.findById(req.params.id)
      .populate('userId', 'firstName lastName email role');

    if (!tirage) {
      return res.status(404).json({
        success: false,
        message: 'Tirage non trouvé'
      });
    }

    // Vérifier les permissions
    if (req.user.role !== 'admin' && tirage.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    res.json({
      success: true,
      data: {
        tirage
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur détail tirage:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du tirage',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/tirages/send-followup - Envoyer l'email de suivi
router.post('/:id/send-followup', authenticate, requireAdmin, logActivity('send_followup'), async (req, res) => {
  try {
    const tirage = await Tirage.findById(req.params.id);

    if (!tirage) {
      return res.status(404).json({
        success: false,
        message: 'Tirage non trouvé'
      });
    }

    // Vérifier si l'email n'a pas déjà été envoyé
    if (tirage.followUpEmail.sent) {
      return res.status(400).json({
        success: false,
        message: 'Email de suivi déjà envoyé'
      });
    }

    // Envoyer l'email (logique à implémenter avec le service email)
    await tirage.sendFollowUpEmail();

    res.json({
      success: true,
      message: 'Email de suivi envoyé avec succès',
      data: {
        sentAt: tirage.followUpEmail.sentAt
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur envoi suivi:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi de l\'email de suivi',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/tirages/:id/feedback - Ajouter un feedback (admin)
router.post('/:id/feedback', authenticate, requireAdmin, logActivity('admin_feedback_add'), async (req, res) => {
  try {
    const tirage = await Tirage.findById(req.params.id);

    if (!tirage) {
      return res.status(404).json({
        success: false,
        message: 'Tirage non trouvé'
      });
    }

    const feedbackData = req.body;
    await tirage.addFeedback(feedbackData);

    res.json({
      success: true,
      message: 'Feedback ajouté avec succès',
      data: {
        feedback: tirage.feedback
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur ajout feedback admin:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'ajout du feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
