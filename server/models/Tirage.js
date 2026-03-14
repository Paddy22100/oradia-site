const mongoose = require('mongoose');

const tirageSchema = new mongoose.Schema({
  // Référence utilisateur
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'ID utilisateur est requis']
  },
  
  // Type de tirage
  type: {
    type: String,
    required: [true, 'Le type de tirage est requis'],
    enum: ['pelerin', 'traversee', 'tore'],
    lowercase: true
  },
  
  // Intention du tirage
  intention: {
    type: String,
    required: [true, 'L\'intention est requise'],
    trim: true,
    maxlength: [500, 'L\'intention ne peut pas dépasser 500 caractères']
  },
  
  // Cartes tirées
  cards: [{
    position: {
      type: String,
      required: true
    },
    cardName: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: ['emotion', 'besoin', 'transmutation', 'archetype', 'revelation', 'action', 'memoire']
    },
    meaning: {
      type: String,
      required: true
    },
    interpretation: {
      type: String,
      required: true
    }
  }],
  
  // Carte Mémoires Cosmos (spécifique à certains tirages)
  memoireCosmos: {
    cardName: String,
    message: String,
    interpretation: String
  },
  
  // Cartes Passerelles (pour tirages avancés)
  passerelles: [{
    from: String,
    to: String,
    meaning: String,
    interpretation: String
  }],
  
  // Synthèse et interprétation globale
  synthese: {
    vibratoire: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    mantra: {
      type: String,
      required: true
    },
    questionIntrospection: {
      type: String
    },
    conseils: [String]
  },
  
  // Métadonnées du tirage
  metadata: {
    duration: {
      type: Number, // en secondes
      default: 0
    },
    device: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet']
    },
    browser: String,
    userAgent: String,
    ipAddress: String
  },
  
  // Statut et suivi
  status: {
    type: String,
    enum: ['en_cours', 'termine', 'abandonne'],
    default: 'en_cours'
  },
  
  // Feedback et synchronicités
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    satisfaction: {
      type: String,
      enum: ['tres_insatisfait', 'insatisfait', 'neutre', 'satisfait', 'tres_satisfait']
    },
    pertinence: {
      type: String,
      enum: ['non_pertinent', 'peu_pertinent', 'pertinent', 'tres_pertinent']
    },
    clarity: {
      type: String,
      enum: ['confus', 'peu_clair', 'clair', 'tres_clair']
    },
    synchronicite: {
      type: Boolean,
      default: false
    },
    synchroniciteDetails: String,
    helpful: {
      type: Boolean,
      default: false
    },
    wouldRecommend: {
      type: Boolean,
      default: false
    },
    improvements: [String]
  },
  
  // Email de suivi
  followUpEmail: {
    sent: {
      type: Boolean,
      default: false
    },
    sentAt: Date,
    opened: {
      type: Boolean,
      default: false
    },
    openedAt: Date,
    clicked: {
      type: Boolean,
      default: false
    },
    clickedAt: Date
  },
  
  // Prix et paiement
  pricing: {
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'EUR'
    },
    paid: {
      type: Boolean,
      default: false
    },
    paidAt: Date,
    paymentMethod: {
      type: String,
      enum: ['stripe', 'paypal', 'free', 'subscription']
    },
    transactionId: String
  },
  
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
tirageSchema.virtual('isPaid').get(function() {
  return this.pricing.amount === 0 || this.pricing.paid;
});

tirageSchema.virtual('completionTime').get(function() {
  if (!this.metadata.duration) return null;
  const minutes = Math.floor(this.metadata.duration / 60);
  const seconds = this.metadata.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Indexes
tirageSchema.index({ userId: 1 });
tirageSchema.index({ type: 1 });
tirageSchema.index({ date: -1 });
tirageSchema.index({ userId: 1, date: -1 });
tirageSchema.index({ 'feedback.rating': 1 });
tirageSchema.index({ 'feedback.synchronicite': 1 });
tirageSchema.index({ status: 1 });
tirageSchema.index({ 'pricing.paid': 1 });

// Middleware
tirageSchema.pre('save', function(next) {
  // Auto-complete status si toutes les cartes sont présentes
  if (this.cards.length > 0 && this.synthese.vibratoire && this.status === 'en_cours') {
    this.status = 'termine';
  }
  next();
});

// Méthodes d'instance
tirageSchema.methods.addFeedback = async function(feedbackData) {
  this.feedback = { ...this.feedback, ...feedbackData };
  await this.save();
  
  // Mettre à jour les stats de l'utilisateur
  const user = await mongoose.model('User').findById(this.userId);
  if (user) {
    await user.updateStats();
  }
  
  return this;
};

tirageSchema.methods.sendFollowUpEmail = async function() {
  // Logique pour envoyer l'email de suivi (sera implémenté dans le service email)
  this.followUpEmail.sent = true;
  this.followUpEmail.sentAt = new Date();
  await this.save();
  
  return this;
};

// Méthodes statiques
tirageSchema.statics.getStats = async function(startDate, endDate) {
  const matchStage = {
    date: { $gte: startDate, $lte: endDate }
  };
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalTirages: { $sum: 1 },
        tiragesPelerin: { $sum: { $cond: [{ $eq: ['$type', 'pelerin'] }, 1, 0] } },
        tiragesTraversee: { $sum: { $cond: [{ $eq: ['$type', 'traversee'] }, 1, 0] } },
        tiragesTore: { $sum: { $cond: [{ $eq: ['$type', 'tore'] }, 1, 0] } },
        averageRating: { $avg: '$feedback.rating' },
        totalRevenue: { $sum: '$pricing.amount' },
        paidTirages: { $sum: { $cond: [{ $eq: ['$pricing.paid', true] }, 1, 0] } },
        synchroniciteRate: {
          $avg: { $cond: [{ $eq: ['$feedback.synchronicite', true] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalTirages: 0,
    tiragesPelerin: 0,
    tiragesTraversee: 0,
    tiragesTore: 0,
    averageRating: 0,
    totalRevenue: 0,
    paidTirages: 0,
    synchroniciteRate: 0
  };
};

tirageSchema.statics.getDailyStats = async function(days = 30) {
  const dailyStats = await this.aggregate([
    {
      $match: {
        date: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        totalTirages: { $sum: 1 },
        tiragesPelerin: { $sum: { $cond: [{ $eq: ['$type', 'pelerin'] }, 1, 0] } },
        tiragesTraversee: { $sum: { $cond: [{ $eq: ['$type', 'traversee'] }, 1, 0] } },
        tiragesTore: { $sum: { $cond: [{ $eq: ['$type', 'tore'] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  return dailyStats;
};

tirageSchema.statics.getTopUsers = async function(limit = 10) {
  return this.aggregate([
    {
      $group: {
        _id: '$userId',
        tiragesCount: { $sum: 1 },
        totalSpent: { $sum: '$pricing.amount' },
        lastTirage: { $max: '$date' }
      }
    },
    { $sort: { tiragesCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' }
  ]);
};

module.exports = mongoose.model('Tirage', tirageSchema);
