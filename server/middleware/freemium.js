const { Credit, Subscription, Device } = require('../models/Freemium');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware pour vérifier les accès freemium
const checkFreemiumAccess = (requiredAccess = 'pelerin') => {
  return async (req, res, next) => {
    try {
      // Si aucune authentification requise (Pèlerin gratuit)
      if (requiredAccess === 'pelerin') {
        // Vérifier les limitations par appareil/IP
        const deviceCheck = await checkDeviceLimitations(req);
        if (!deviceCheck.allowed) {
          return res.status(429).json({
            success: false,
            message: deviceCheck.message,
            code: deviceCheck.code
          });
        }
        return next();
      }

      // Pour les accès payants, vérifier l'authentification
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentification requise',
          code: 'AUTH_REQUIRED'
        });
      }

      // Vérifier le token JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non trouvé',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.emailVerified) {
        return res.status(403).json({
          success: false,
          message: 'Veuillez vérifier votre email',
          code: 'EMAIL_NOT_VERIFIED'
        });
      }

      // Ajouter l'utilisateur à la requête
      req.user = user;

      // Vérifier les accès selon le niveau requis
      if (requiredAccess === 'traversee') {
        const hasAccess = await checkTraverseeAccess(user._id);
        if (!hasAccess.allowed) {
          return res.status(403).json({
            success: false,
            message: hasAccess.message,
            code: 'INSUFFICIENT_CREDITS',
            data: {
              credits: hasAccess.credits,
              required: 1
            }
          });
        }
        req.credits = hasAccess.credits;
      }

      if (requiredAccess === 'tore') {
        const hasAccess = await checkToreAccess(user._id);
        if (!hasAccess.allowed) {
          return res.status(403).json({
            success: false,
            message: hasAccess.message,
            code: 'SUBSCRIPTION_REQUIRED'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Erreur middleware freemium:', error);
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Token invalide',
          code: 'INVALID_TOKEN'
        });
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expiré',
          code: 'TOKEN_EXPIRED'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur serveur',
        code: 'SERVER_ERROR'
      });
    }
  };
};

// Vérifier les limitations par appareil/IP
const checkDeviceLimitations = async (req) => {
  try {
    const deviceId = getDeviceId(req);
    const fingerprint = getFingerprint(req);
    const ip = getClientIP(req);

    // Vérifier l'appareil
    let device = await Device.findOne({ deviceId });
    
    if (!device) {
      device = new Device({
        deviceId,
        fingerprint,
        userAgent: req.get('User-Agent'),
        ip
      });
    } else {
      // Mettre à jour les infos si nécessaire
      device.lastSeen = new Date();
      if (device.ip !== ip) {
        device.ip = ip;
      }
      await device.save();
    }

    // Vérifier si l'appareil est bloqué
    if (device.blocked) {
      return {
        allowed: false,
        message: 'Appareil bloqué',
        code: 'DEVICE_BLOCKED'
      };
    }

    // Vérifier la limite de tirages gratuits par appareil
    if (device.freeReadingsCount >= 5) {
      return {
        allowed: false,
        message: 'Limite de tirages gratuits atteinte. Explorez nos offres pour continuer.',
        code: 'FREE_LIMIT_REACHED'
      };
    }

    // Vérifier le nombre de comptes par IP
    const devicesFromIP = await Device.find({ ip });
    const totalAccountsFromIP = devicesFromIP.reduce((sum, d) => sum + d.accountsCreated, 0);
    
    if (totalAccountsFromIP >= 3) {
      return {
        allowed: false,
        message: 'Trop de comptes créés depuis cette adresse IP',
        code: 'IP_LIMIT_REACHED'
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Erreur vérification limitations:', error);
    return { allowed: false, message: 'Erreur de vérification', code: 'CHECK_ERROR' };
  }
};

// Vérifier l'accès à la Traversée
const checkTraverseeAccess = async (userId) => {
  try {
    const credits = await Credit.findOne({ userId });
    
    if (!credits || credits.credits <= 0) {
      return {
        allowed: false,
        message: 'Aucun crédit disponible. Achetez des crédits pour accéder à la Traversée.',
        credits: credits?.credits || 0
      };
    }

    return { allowed: true, credits: credits.credits };
  } catch (error) {
    console.error('Erreur vérification accès Traversée:', error);
    return { allowed: false, message: 'Erreur de vérification', credits: 0 };
  }
};

// Vérifier l'accès au Tore
const checkToreAccess = async (userId) => {
  try {
    const subscription = await Subscription.findOne({ userId });
    
    if (!subscription || !subscription.isActive()) {
      return {
        allowed: false,
        message: 'Abonnement requis pour accéder à cette fonctionnalité.'
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Erreur vérification accès Tore:', error);
    return { allowed: false, message: 'Erreur de vérification' };
  }
};

// Utiliser un crédit de Traversée
const useTraverseeCredit = async (userId) => {
  try {
    const credits = await Credit.findOne({ userId });
    
    if (!credits || credits.credits <= 0) {
      throw new Error('Aucun crédit disponible');
    }

    const remainingCredits = await credits.useCredit();
    
    return { success: true, remainingCredits };
  } catch (error) {
    console.error('Erreur utilisation crédit:', error);
    return { success: false, error: error.message };
  }
};

// Incrémenter le compteur de tirages gratuits
const incrementFreeReading = async (req) => {
  try {
    const deviceId = getDeviceId(req);
    const device = await Device.findOne({ deviceId });
    
    if (device) {
      await device.incrementFreeReadings();
    }
    
    return { success: true };
  } catch (error) {
    console.error('Erreur incrémentation tirage gratuit:', error);
    return { success: false, error: error.message };
  }
};

// Associer un appareil à un utilisateur lors de l'inscription
const associateDeviceToUser = async (req, userId) => {
  try {
    const deviceId = getDeviceId(req);
    const device = await Device.findOne({ deviceId });
    
    if (device) {
      device.userId = userId;
      await device.incrementAccountsCreated();
    }
    
    return { success: true };
  } catch (error) {
    console.error('Erreur association appareil:', error);
    return { success: false, error: error.message };
  }
};

// Générer un ID d'appareil unique
const getDeviceId = (req) => {
  // Utiliser une combinaison de User-Agent et d'autres infos
  const userAgent = req.get('User-Agent') || '';
  const acceptLanguage = req.get('Accept-Language') || '';
  const acceptEncoding = req.get('Accept-Encoding') || '';
  
  const fingerprint = `${userAgent}|${acceptLanguage}|${acceptEncoding}`;
  
  // Générer un hash simple
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convertir en 32-bit integer
  }
  
  return `device_${Math.abs(hash)}`;
};

// Générer un fingerprint plus détaillé
const getFingerprint = (req) => {
  const headers = req.headers;
  return JSON.stringify({
    userAgent: headers['user-agent'],
    accept: headers['accept'],
    acceptLanguage: headers['accept-language'],
    acceptEncoding: headers['accept-encoding'],
    dnt: headers['dnt'],
    upgradeInsecureRequests: headers['upgrade-insecure-requests']
  });
};

// Obtenir l'IP réelle du client
const getClientIP = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.headers['x-client-ip'] ||
         req.headers['x-forwarded'] ||
         '0.0.0.0';
};

// Middleware pour les routes publiques avec tracking
const publicRouteTracker = async (req, res, next) => {
  // Tracker les visites sur les pages publiques pour analytics
  const deviceId = getDeviceId(req);
  const ip = getClientIP(req);
  
  try {
    let device = await Device.findOne({ deviceId });
    
    if (!device) {
      device = new Device({
        deviceId,
        fingerprint: getFingerprint(req),
        userAgent: req.get('User-Agent'),
        ip
      });
      await device.save();
    } else {
      device.lastSeen = new Date();
      await device.save();
    }
  } catch (error) {
    // Ne pas bloquer la route en cas d'erreur de tracking
    console.error('Erreur tracking route publique:', error);
  }
  
  next();
};

module.exports = {
  checkFreemiumAccess,
  useTraverseeCredit,
  incrementFreeReading,
  associateDeviceToUser,
  publicRouteTracker,
  checkDeviceLimitations,
  checkTraverseeAccess,
  checkToreAccess
};
