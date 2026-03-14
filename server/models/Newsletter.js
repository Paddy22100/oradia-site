const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
  // Email principal
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
  },
  
  // Référence utilisateur (si applicable)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Statut d'abonnement
  active: {
    type: Boolean,
    default: true
  },
  
  // Segmentation
  segments: [{
    type: String,
    enum: [
      'visitors',           // Visiteurs du site
      'pelerin_users',      // Utilisateurs du tirage pèlerin
      'traversee_users',    // Utilisateurs du tirage traversée
      'tore_users',         // Utilisateurs du tirage tore
      'members',           // Membres abonnés
      'feedback_givers',   // Ont donné un feedback
      'synchronicite_reports', // Ont rapporté des synchronicités
      'high_engagement',  // Fort engagement
      'new_users',        // Nouveaux utilisateurs (<30 jours)
      'returning_users'   // Utilisateurs réguliers
    ]
  }],
  
  // Préférences
  preferences: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'never'],
      default: 'weekly'
    },
    contentTypes: [{
      type: String,
      enum: [
        'oracle_updates',     // Nouveautés oracle
        'tirage_tips',       // Conseils de tirage
        'synchronicite_stories', // Histoires de synchronicités
        'events_workshops',  // Événements et ateliers
        'special_offers',    // Offres spéciales
        'newsletter_general' // Newsletter générale
      ]
    }],
    language: {
      type: String,
      enum: ['fr', 'en'],
      default: 'fr'
    },
    timezone: {
      type: String,
      default: 'Europe/Paris'
    }
  },
  
  // Statistiques d'engagement
  stats: {
    totalEmailsSent: {
      type: Number,
      default: 0
    },
    totalEmailsOpened: {
      type: Number,
      default: 0
    },
    totalEmailsClicked: {
      type: Number,
      default: 0
    },
    lastOpenedAt: Date,
    lastClickedAt: Date,
    openRate: {
      type: Number,
      default: 0
    },
    clickRate: {
      type: Number,
      default: 0
    },
    engagementScore: {
      type: Number,
      default: 0
    }
  },
  
  // Source d'inscription
  source: {
    type: String,
    enum: [
      'footer_signup',
      'contact_form',
      'tirage_form',
      'user_registration',
      'admin_import',
      'external_campaign',
      'popup_signup',
      'manual_add'
    ],
    default: 'footer_signup'
  },
  
  // Métadonnées
  metadata: {
    ipAddress: String,
    userAgent: String,
    device: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet']
    },
    browser: String,
    referrer: String,
    landingPage: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String
  },
  
  // Gestion des désabonnements
  unsubscribeReason: {
    type: String,
    maxlength: [500, 'La raison ne peut pas dépasser 500 caractères']
  },
  
  unsubscribeAt: Date,
  
  // Validation email
  emailVerified: {
    type: Boolean,
    default: false
  },
  
  emailVerificationToken: String,
  emailVerificationSentAt: Date,
  
  // Soft delete
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Virtuals
newsletterSchema.virtual('isEngaged').get(function() {
  return this.stats.engagementScore >= 50;
});

newsletterSchema.virtual('openRatePercentage').get(function() {
  if (this.stats.totalEmailsSent === 0) return 0;
  return Math.round((this.stats.totalEmailsOpened / this.stats.totalEmailsSent) * 100);
});

newsletterSchema.virtual('clickRatePercentage').get(function() {
  if (this.stats.totalEmailsOpened === 0) return 0;
  return Math.round((this.stats.totalEmailsClicked / this.stats.totalEmailsOpened) * 100);
});

// Indexes
newsletterSchema.index({ email: 1 }, { unique: true });
newsletterSchema.index({ active: 1 });
newsletterSchema.index({ segments: 1 });
newsletterSchema.index({ userId: 1 });
newsletterSchema.index({ createdAt: -1 });
newsletterSchema.index({ 'stats.engagementScore': -1 });
newsletterSchema.index({ unsubscribeAt: 1 });

// Middleware
newsletterSchema.pre('save', function(next) {
  // Calcul automatique des taux
  if (this.isModified('stats.totalEmailsSent') || 
      this.isModified('stats.totalEmailsOpened') || 
      this.isModified('stats.totalEmailsClicked')) {
    this.calculateRates();
  }
  
  // Auto-segmentation basée sur l'utilisateur
  if (this.isModified('userId')) {
    this.autoSegment();
  }
  
  next();
});

// Méthodes d'instance
newsletterSchema.methods.calculateRates = function() {
  if (this.stats.totalEmailsSent > 0) {
    this.stats.openRate = (this.stats.totalEmailsOpened / this.stats.totalEmailsSent) * 100;
  }
  
  if (this.stats.totalEmailsOpened > 0) {
    this.stats.clickRate = (this.stats.totalEmailsClicked / this.stats.totalEmailsOpened) * 100;
  }
  
  // Calcul du score d'engagement
  this.stats.engagementScore = Math.round(
    (this.stats.openRate * 0.4) + 
    (this.stats.clickRate * 0.6)
  );
};

newsletterSchema.methods.autoSegment = async function() {
  if (!this.userId) return;
  
  try {
    const user = await mongoose.model('User').findById(this.userId);
    if (!user) return;
    
    // Segmentation basée sur le profil utilisateur
    this.segments = [];
    
    // Toujours ajouter visitors
    this.segments.push('visitors');
    
    // Segments basés sur les tirages
    const tirages = await mongoose.model('Tirage').find({ userId: this.userId });
    const tirageTypes = new Set(tirages.map(t => t.type));
    
    if (tirageTypes.has('pelerin')) this.segments.push('pelerin_users');
    if (tirageTypes.has('traversee')) this.segments.push('traversee_users');
    if (tirageTypes.has('tore')) this.segments.push('tore_users');
    
    // Segment membre
    if (user.subscriptionActive) {
      this.segments.push('members');
    }
    
    // Segments basés sur l'engagement
    const feedbacks = await mongoose.model('Feedback').find({ userId: this.userId });
    if (feedbacks.length > 0) {
      this.segments.push('feedback_givers');
      
      const synchroniciteCount = feedbacks.filter(f => f.synchronicite).length;
      if (synchroniciteCount > 0) {
        this.segments.push('synchronicite_reports');
      }
    }
    
    // Segments temporels
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    if (user.createdAt > thirtyDaysAgo) {
      this.segments.push('new_users');
    } else if (tirages.length > 3) {
      this.segments.push('returning_users');
    }
    
    // High engagement
    if (tirages.length > 5 || feedbacks.length > 2) {
      this.segments.push('high_engagement');
    }
    
  } catch (error) {
    console.error('Erreur auto-segmentation:', error);
  }
};

newsletterSchema.methods.trackEmailSent = function() {
  this.stats.totalEmailsSent++;
  return this.save();
};

newsletterSchema.methods.trackEmailOpened = function() {
  this.stats.totalEmailsOpened++;
  this.stats.lastOpenedAt = new Date();
  this.calculateRates();
  return this.save();
};

newsletterSchema.methods.trackEmailClicked = function() {
  this.stats.totalEmailsClicked++;
  this.stats.lastClickedAt = new Date();
  this.calculateRates();
  return this.save();
};

newsletterSchema.methods.unsubscribe = function(reason) {
  this.active = false;
  this.unsubscribeReason = reason;
  this.unsubscribeAt = new Date();
  return this.save();
};

// Méthodes statiques
newsletterSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalSubscribers: { $sum: 1 },
        activeSubscribers: { $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] } },
        unsubscribedCount: { $sum: { $cond: [{ $ne: ['$unsubscribeAt', null] }, 1, 0] } },
        newSubscribersThisMonth: {
          $sum: {
            $cond: [
              { $gte: ['$createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)] },
              1,
              0
            ]
          }
        },
        avgOpenRate: { $avg: '$stats.openRate' },
        avgClickRate: { $avg: '$stats.clickRate' },
        avgEngagementScore: { $avg: '$stats.engagementScore' }
      }
    }
  ]);
  
  return stats[0] || {
    totalSubscribers: 0,
    activeSubscribers: 0,
    unsubscribedCount: 0,
    newSubscribersThisMonth: 0,
    avgOpenRate: 0,
    avgClickRate: 0,
    avgEngagementScore: 0
  };
};

newsletterSchema.statics.getSegmentStats = async function() {
  return this.aggregate([
    { $match: { active: true } },
    { $unwind: '$segments' },
    {
      $group: {
        _id: '$segments',
        count: { $sum: 1 },
        avgEngagement: { $avg: '$stats.engagementScore' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

newsletterSchema.statics.getTopEngagedSubscribers = async function(limit = 10) {
  return this.find({ active: true })
    .populate('userId', 'firstName lastName email')
    .sort({ 'stats.engagementScore': -1 })
    .limit(limit);
};

newsletterSchema.statics.getRecentUnsubscribes = async function(limit = 20) {
  return this.find({ 
    active: false, 
    unsubscribeAt: { $exists: true } 
  })
    .sort({ unsubscribeAt: -1 })
    .limit(limit)
    .populate('userId', 'firstName lastName email');
};

module.exports = mongoose.model('Newsletter', newsletterSchema);
