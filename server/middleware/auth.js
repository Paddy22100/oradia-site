const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware d'authentification
const authenticate = async (req, res, next) => {
  try {
    // Vérifier le token dans le header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Accès refusé. Token manquant ou invalide.'
      });
    }

    const token = authHeader.substring(7); // Enlever 'Bearer '

    try {
      // Vérifier et décoder le token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Récupérer l'utilisateur
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Token invalide. Utilisateur non trouvé.'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Compte désactivé.'
        });
      }

      // Ajouter l'utilisateur à la requête
      req.user = user;
      next();

    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide ou expiré.'
      });
    }

  } catch (error) {
    console.error('Erreur auth middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification.'
    });
  }
};

// Middleware pour vérifier le rôle admin
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentification requise.'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Droits administratifs requis.'
    });
  }

  next();
};

// Middleware pour vérifier les rôles autorisés
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôles requis: ${roles.join(', ')}`
      });
    }

    next();
  };
};

// Middleware optionnel (ne bloque pas si non authentifié)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue sans authentification
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    } catch (jwtError) {
      // Ignorer les erreurs de token pour l'auth optionnelle
    }

    next();

  } catch (error) {
    console.error('Erreur optional auth middleware:', error);
    next();
  }
};

// Middleware pour vérifier l'accès à ses propres ressources
const requireOwnership = (resourceField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise.'
      });
    }

    // Les admins peuvent accéder à tout
    if (req.user.role === 'admin') {
      return next();
    }

    // Vérifier que l'utilisateur est le propriétaire de la ressource
    const resourceUserId = req.params.id || req.body[resourceField] || req.query[resourceField];
    
    if (resourceUserId && resourceUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Vous n\'êtes pas le propriétaire de cette ressource.'
      });
    }

    next();
  };
};

// Middleware pour vérifier l'abonnement actif
const requireActiveSubscription = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentification requise.'
    });
  }

  if (!req.user.subscriptionActive || req.user.subscriptionExpiresAt < new Date()) {
    return res.status(403).json({
      success: false,
      message: 'Abonnement inactif ou expiré.',
      code: 'SUBSCRIPTION_EXPIRED'
    });
  }

  next();
};

// Middleware pour logger les activités
const logActivity = (action) => {
  return (req, res, next) => {
    if (req.user) {
      console.log(`[${new Date().toISOString()}] ${req.user.email} - ${action} - ${req.method} ${req.originalUrl}`);
    }
    next();
  };
};

module.exports = {
  authenticate,
  requireAdmin,
  requireRole,
  optionalAuth,
  requireOwnership,
  requireActiveSubscription,
  logActivity
};
