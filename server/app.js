const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');
const tirageRoutes = require('./routes/tirages');
const feedbackRoutes = require('./routes/feedbacks');
const newsletterRoutes = require('./routes/newsletter');
const paymentRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware de sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://fonts.googleapis.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://oradia.vercel.app', 'https://www.oradia.fr']
    : ['http://localhost:3000', 'http://127.0.0.1:5500', 'file://'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Rate limiting différencié
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives max pour auth
  message: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
  skipSuccessfulRequests: false,
  keyGenerator: (req) => req.ip + ':' + (req.body?.email || req.body?.identifier || 'unknown')
});

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 soumissions par heure
  message: 'Limite de soumissions atteinte. Veuillez réessayer plus tard.'
});

const generalLimiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 100,
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
});

// Appliquer les rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/contact', formLimiter);
app.use('/api/newsletter', formLimiter);
app.use('/api/', generalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques du frontend
app.use(express.static(path.join(__dirname, '..')));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/tirages', tirageRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/payments', paymentRoutes);

// Route pour le dashboard admin (servir le HTML)
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});

// Route pour l'espace client
app.get('/user/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'user', 'dashboard.html'));
});

// Route pour auth/login
app.get('/auth/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'auth', 'login.html'));
});

// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/oradia', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connecté à MongoDB');
  startServer();
})
.catch((err) => {
  console.error('❌ Erreur de connexion MongoDB:', err);
  process.exit(1);
});

function startServer() {
  app.listen(PORT, () => {
    console.log(`🚀 Serveur ORADIA démarré sur le port ${PORT}`);
    console.log(`📊 Dashboard Admin: http://localhost:${PORT}/admin/dashboard`);
    console.log(`👤 Espace Client: http://localhost:${PORT}/user/dashboard`);
    console.log(`🔐 Auth: http://localhost:${PORT}/auth/login`);
  });
}

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Erreur serveur',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée'
  });
});

module.exports = app;
