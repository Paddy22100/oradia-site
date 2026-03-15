const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Newsletter = require('../models/Newsletter');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Middleware de détection de bots
const detectBot = (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const suspiciousPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i,
    /python/i, /java/i, /node/i, /php/i, /ruby/i
  ];

  // Vérifier l'user agent
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(userAgent)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé'
      });
    }
  }

  // Vérifier le referer pour les POST
  if (req.method === 'POST' && !req.get('Referer') && process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé'
    });
  }

  // Vérifier la vitesse de soumission
  if (req.body.form_load_time && req.body.submission_time) {
    const timeDiff = req.body.submission_time - req.body.form_load_time;
    if (timeDiff < 2000) { // Moins de 2 secondes = bot probable
      return res.status(429).json({
        success: false,
        message: 'Veuillez patienter avant de soumettre à nouveau'
      });
    }
  }

  next();
};

// Middleware de validation et sanitization
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return '';
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  };

  const sanitizeObject = (obj) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  next();
};

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide'),
  body('password')
    .notEmpty()
    .withMessage('Le mot de passe est requis')
];

// POST /api/auth/register - Inscription
router.post('/register', detectBot, sanitizeInput, registerValidation, async (req, res) => {
  try {
    // Validation des entrées
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: errors.array()
      });
    }

    const { email, password, firstName, lastName, consentements } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé.'
      });
    }

    // Créer le nouvel utilisateur
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      consentements: {
        newsletter: consentements?.newsletter || false,
        analytics: consentements?.analytics !== false, // true par défaut
        marketing: consentements?.marketing || false
      }
    });

    await user.save();

    // Créer l'inscription newsletter si demandé
    if (consentements?.newsletter) {
      try {
        await Newsletter.create({
          email,
          userId: user._id,
          source: 'user_registration',
          segments: ['visitors', 'new_users']
        });
      } catch (newsletterError) {
        // console.error(console.error('Erreur création newsletter:', newsletterError);)
        // Ne pas bloquer l'inscription si la newsletter échoue
      }
    }

    // Générer le token JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    // Mettre à jour la date de dernière connexion
    user.lastLogin = new Date();
    user.loginCount = 1;
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          subscriptionActive: user.subscriptionActive,
          consentements: user.consentements
        }
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur inscription:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'inscription',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/auth/login - Connexion
router.post('/login', detectBot, sanitizeInput, loginValidation, async (req, res) => {
  try {
    // Validation des entrées
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Trouver l'utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.'
      });
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Compte désactivé.'
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.'
      });
    }

    // Générer le token JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    // Mettre à jour la date de dernière connexion
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    res.json({
      success: true,
      message: 'Connexion réussie',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          subscriptionActive: user.subscriptionActive,
          subscriptionType: user.subscriptionType,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
          stats: user.stats,
          consentements: user.consentements
        }
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur connexion:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la connexion',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// GET /api/auth/me - Obtenir le profil utilisateur authentifié
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -resetPasswordToken -emailVerificationToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé.'
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur get profile:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// PUT /api/auth/profile - Mettre à jour le profil
router.put('/profile', authenticate, [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide')
], async (req, res) => {
  try {
    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, profile, consentements } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé.'
      });
    }

    // Mettre à jour les champs de base
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    
    // Mettre à jour l'email (vérifier l'unicité)
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Cet email est déjà utilisé.'
        });
      }
      user.email = email;
    }

    // Mettre à jour le profil étendu
    if (profile) {
      user.profile = { ...user.profile, ...profile };
    }

    // Mettre à jour les consentements
    if (consentements) {
      user.consentements = { ...user.consentements, ...consentements };
      
      // Gérer l'inscription newsletter
      if (consentements.newsletter && !user.consentements.newsletter) {
        try {
          await Newsletter.create({
            email: user.email,
            userId: user._id,
            source: 'user_profile_update',
            segments: ['visitors']
          });
        } catch (newsletterError) {
          // console.error(console.error('Erreur newsletter update:', newsletterError);)
        }
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      data: {
        user: user.toJSON()
      }
    });

  } catch (error) {
    // console.error(console.error('Erreur update profile:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// PUT /api/auth/password - Changer le mot de passe
router.put('/password', authenticate, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Le mot de passe actuel est requis'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé.'
      });
    }

    // Vérifier le mot de passe actuel
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe actuel incorrect.'
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Mot de passe changé avec succès'
    });

  } catch (error) {
    // console.error(console.error('Erreur change password:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du changement de mot de passe',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/auth/logout - Déconnexion
router.post('/logout', authenticate, async (req, res) => {
  try {
    // En production, on pourrait ajouter le token à une blacklist
    // Pour l'instant, on retourne simplement un succès
    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });

  } catch (error) {
    // console.error(console.error('Erreur logout:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la déconnexion',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// POST /api/auth/forgot-password - Mot de passe oublié
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: errors.array()
      });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });

    // Toujours retourner un succès pour ne pas révéler si l'email existe
    if (!user) {
      return res.json({
        success: true,
        message: 'Si cet email existe, un email de réinitialisation a été envoyé.'
      });
    }

    // Générer un token de réinitialisation
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // TODO: Envoyer l'email de réinitialisation
    // Pour l'instant, on retourne juste le succès
    // console.log(console.log('Token reset password:', resetToken);)

    res.json({
      success: true,
      message: 'Si cet email existe, un email de réinitialisation a été envoyé.'
    });

  } catch (error) {
    // console.error(console.error('Erreur forgot password:', error);)
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
