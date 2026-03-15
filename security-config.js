/**
 * Configuration de sécurité pour le déploiement Vercel
 * Variables d'environnement et headers de sécurité
 */

// Configuration pour Vercel (vercel.json)
const vercelConfig = {
  "version": 2,
  "builds": [
    {
      "src": "server/app.js",
      "use": "@vercel/node"
    },
    {
      "src": "**/*.html",
      "use": "@vercel/static"
    },
    {
      "src": "**/*.{js,css,png,jpg,jpeg,gif,svg,ico}",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/server/app.js"
    },
    {
      "src": "/admin/(.*)",
      "dest": "/admin/$1"
    },
    {
      "src": "/user/(.*)",
      "dest": "/user/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), payment=()"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com https://fonts.googleapis.com; frame-src 'self' https://js.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self'"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://fonts.googleapis.com; frame-src 'self' https://js.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self'"
        }
      ]
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
};

// Variables d'environnement requises pour Vercel
const requiredEnvVars = {
  // Base de données
  MONGODB_URI: "mongodb+srv://username:password@cluster.mongodb.net/oradia?retryWrites=true&w=majority",
  
  // JWT
  JWT_SECRET: "your-super-secret-jwt-key-min-32-characters-long",
  JWT_EXPIRE: "7d",
  
  // Rate limiting
  RATE_LIMIT_WINDOW: "15", // minutes
  RATE_LIMIT_MAX: "100", // requests per window
  
  // Email (pour les réinitialisations de mot de passe)
  EMAIL_HOST: "smtp.gmail.com",
  EMAIL_PORT: "587",
  EMAIL_USER: "your-email@gmail.com",
  EMAIL_PASS: "your-app-password",
  
  // Stripe
  STRIPE_PUBLISHABLE_KEY: "pk_live_...",
  STRIPE_SECRET_KEY: "sk_live_...",
  STRIPE_WEBHOOK_SECRET: "whsec_...",
  
  // URLs de production
  FRONTEND_URL: "https://oradia.vercel.app",
  BACKEND_URL: "https://oradia.vercel.app",
  
  // Analytics (optionnel)
  GOOGLE_ANALYTICS_ID: "G-XXXXXXXXXX",
  
  // Logs
  LOG_LEVEL: "error"
};

// Configuration améliorée pour le serveur Express
const securityConfig = {
  // CSP plus stricte pour l'API
  apiCSP: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      workerSrc: ["'none'"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  
  // CSP pour le frontend
  frontendCSP: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://js.stripe.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://fonts.googleapis.com", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  
  // Rate limiting par route
  rateLimiting: {
    // Auth routes - plus strict
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 tentatives max
      message: "Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.",
      skipSuccessfulRequests: false
    },
    
    // API général
    api: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requêtes max
      message: "Trop de requêtes. Veuillez réessayer plus tard."
    },
    
    // Formulaires - protection contre spam
    forms: {
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 soumissions max par heure
      message: "Limite de soumissions atteinte. Veuillez réessayer plus tard."
    }
  },
  
  // Configuration CORS
  corsConfig: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://oradia.vercel.app', 'https://www.oradia.fr']
      : ['http://localhost:3000', 'http://127.0.0.1:5500', 'file://'],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
  }
};

// Middleware de sécurité pour Express
const createSecurityMiddleware = (express, helmet, rateLimit) => {
  const securityMiddleware = [];
  
  // Headers de sécurité avec Helmet
  securityMiddleware.push(
    helmet({
      contentSecurityPolicy: securityConfig.apiCSP,
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    })
  );
  
  // Rate limiting général
  securityMiddleware.push(
    rateLimit(securityConfig.rateLimiting.api)
  );
  
  // Parser JSON avec limite de taille
  securityMiddleware.push(
    express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  
  return securityMiddleware;
};

// Validation des variables d'environnement
const validateEnvVars = () => {
  const missing = [];
  
  Object.entries(requiredEnvVars).forEach(([key, value]) => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });
  
  if (missing.length > 0) {
    console.error('Variables d\'environnement manquantes:', missing);
    process.exit(1);
  }
  
  console.log('✅ Variables d\'environnement validées');
};

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    vercelConfig,
    requiredEnvVars,
    securityConfig,
    createSecurityMiddleware,
    validateEnvVars
  };
}

// Pour le frontend
if (typeof window !== 'undefined') {
  window.SecurityConfig = {
    // Timeout pour les requêtes API
    apiTimeout: 10000,
    
    // Limites de taille pour les uploads
    maxUploadSize: 5 * 1024 * 1024, // 5MB
    
    // Retry configuration
    retryConfig: {
      maxRetries: 3,
      retryDelay: 1000
    }
  };
}
