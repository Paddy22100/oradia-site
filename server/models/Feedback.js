const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  // Références
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'ID utilisateur est requis']
  },
  tirageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tirage',
    required: [true, 'L\'ID du tirage est requis']
  },
  
  // Évaluation principale
  rating: {
    type: Number,
    required: [true, 'La note est requise'],
    min: [1, 'La note minimale est 1'],
    max: [5, 'La note maximale est 5']
  },
  
  // Commentaire libre
  comment: {
    type: String,
    trim: true,
    maxlength: [2000, 'Le commentaire ne peut pas dépasser 2000 caractères']
  },
  
  // Évaluations détaillées
  satisfaction: {
    type: String,
    enum: ['tres_insatisfait', 'insatisfait', 'neutre', 'satisfait', 'tres_satisfait'],
    required: [true, 'La satisfaction est requise']
  },
  
  pertinence: {
    type: String,
    enum: ['non_pertinent', 'peu_pertinent', 'pertinent', 'tres_pertinent'],
    required: [true, 'La pertinence est requise']
  },
  
  clarity: {
    type: String,
    enum: ['confus', 'peu_clair', 'clair', 'tres_clair'],
    required: [true, 'La clarté est requise']
  },
  
  // Expérience utilisateur
  helpful: {
    type: Boolean,
    required: [true, 'Veuillez indiquer si le tirage a été utile']
  },
  
  wouldRecommend: {
    type: Boolean,
    required: [true, 'Veuillez indiquer si vous recommanderiez ce tirage']
  },
  
  // Synchronicités
  synchronicite: {
    type: Boolean,
    required: [true, 'Veuillez indiquer si vous avez vécu des synchronicités']
  },
  
  synchroniciteDetails: {
    type: String,
    trim: true,
    maxlength: [1000, 'Les détails de synchronicité ne peuvent pas dépasser 1000 caractères']
  },
  
  // Améliorations suggérées
  improvements: [{
    type: String,
    trim: true,
    maxlength: [200, 'Chaque suggestion ne peut pas dépasser 200 caractères']
  }],
  
  // Catégories automatiques (basées sur le contenu)
  categories: [{
    type: String,
    enum: ['satisfaction', 'clarté', 'pertinence', 'ergonomie', 'amélioration', 'synchronicité', 'technique', 'contenu']
  }],
  
  // Éléments appréciés
  likedElements: [{
    type: String,
    trim: true,
    maxlength: [100, 'Chaque élément ne peut pas dépasser 100 caractères']
  }],
  
  // Éléments à améliorer
  dislikedElements: [{
    type: String,
    trim: true,
    maxlength: [100, 'Chaque élément ne peut pas dépasser 100 caractères']
  }],
  
  // Métadonnées
  metadata: {
    device: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet']
    },
    browser: String,
    userAgent: String,
    ipAddress: String,
    responseTime: {
      type: Number, // temps entre le tirage et le feedback en heures
      default: 0
    }
  },
  
  // Modération
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'hidden'],
    default: 'approved'
  },
  
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  moderatedAt: Date,
  
  moderationReason: String,
  
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
feedbackSchema.virtual('isPositive').get(function() {
  return this.rating >= 4;
});

feedbackSchema.virtual('responseTimeHours').get(function() {
  if (!this.metadata.responseTime) return null;
  return Math.round(this.metadata.responseTime * 100) / 100;
});

// Indexes
feedbackSchema.index({ userId: 1 });
feedbackSchema.index({ tirageId: 1 });
feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ synchronicite: 1 });
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ categories: 1 });

// Middleware
feedbackSchema.pre('save', function(next) {
  // Auto-catégorisation basée sur le contenu
  if (this.isModified('comment') || this.isModified('improvements')) {
    this.categorizeFeedback();
  }
  
  // Calcul du temps de réponse si non défini
  if (this.isModified('tirageId') && !this.metadata.responseTime) {
    this.calculateResponseTime();
  }
  
  next();
});

// Méthodes d'instance
feedbackSchema.methods.categorizeFeedback = function() {
  const content = `${this.comment || ''} ${(this.improvements || []).join(' ')}`.toLowerCase();
  
  this.categories = [];
  
  // Catégorisation automatique
  if (content.includes('satisfait') || content.includes('content') || content.includes('bien')) {
    this.categories.push('satisfaction');
  }
  
  if (content.includes('clair') || content.includes('compréhensible') || content.includes('explication')) {
    this.categories.push('clarté');
  }
  
  if (content.includes('pertinent') || content.includes('juste') || content.includes('précis')) {
    this.categories.push('pertinence');
  }
  
  if (content.includes('facile') || content.includes('simple') || content.includes('intuitif')) {
    this.categories.push('ergonomie');
  }
  
  if (content.includes('améliorer') || content.includes('suggestion') || content.includes('idée')) {
    this.categories.push('amélioration');
  }
  
  if (content.includes('synchron') || content.includes('coïncidence') || content.includes('signe')) {
    this.categories.push('synchronicité');
  }
  
  if (content.includes('technique') || content.includes('bug') || content.includes('erreur')) {
    this.categories.push('technique');
  }
  
  if (content.includes('contenu') || content.includes('texte') || content.includes('message')) {
    this.categories.push('contenu');
  }
};

feedbackSchema.methods.calculateResponseTime = async function() {
  try {
    const tirage = await mongoose.model('Tirage').findById(this.tirageId);
    if (tirage && tirage.date) {
      const diffInHours = (this.createdAt - tirage.date) / (1000 * 60 * 60);
      this.metadata.responseTime = diffInHours;
    }
  } catch (error) {
    // console.error(console.error('Erreur calcul temps de réponse:', error);)
  }
};

// Méthodes statiques
feedbackSchema.statics.getStats = async function(startDate, endDate) {
  const matchStage = {
    createdAt: { $gte: startDate, $lte: endDate },
    status: 'approved'
  };
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalFeedbacks: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        synchroniciteRate: { $avg: { $cond: [{ $eq: ['$synchronicite', true] }, 1, 0] } },
        helpfulRate: { $avg: { $cond: [{ $eq: ['$helpful', true] }, 1, 0] } },
        recommendRate: { $avg: { $cond: [{ $eq: ['$wouldRecommend', true] }, 1, 0] } },
        satisfactionDistribution: {
          $push: '$satisfaction'
        },
        pertinenceDistribution: {
          $push: '$pertinence'
        },
        clarityDistribution: {
          $push: '$clarity'
        }
      }
    }
  ]);
  
  const result = stats[0] || {
    totalFeedbacks: 0,
    averageRating: 0,
    synchroniciteRate: 0,
    helpfulRate: 0,
    recommendRate: 0,
    satisfactionDistribution: [],
    pertinenceDistribution: [],
    clarityDistribution: []
  };
  
  // Calcul des distributions
  result.satisfactionBreakdown = this.calculateDistribution(result.satisfactionDistribution);
  result.pertinenceBreakdown = this.calculateDistribution(result.pertinenceDistribution);
  result.clarityBreakdown = this.calculateDistribution(result.clarityDistribution);
  
  delete result.satisfactionDistribution;
  delete result.pertinenceDistribution;
  delete result.clarityDistribution;
  
  return result;
};

feedbackSchema.statics.calculateDistribution = function(array) {
  const distribution = {
    tres_insatisfait: 0,
    insatisfait: 0,
    neutre: 0,
    satisfait: 0,
    tres_satisfait: 0
  };
  
  array.forEach(item => {
    if (distribution.hasOwnProperty(item)) {
      distribution[item]++;
    }
  });
  
  return distribution;
};

feedbackSchema.statics.getRecentFeedbacks = async function(limit = 10) {
  return this.find({ status: 'approved' })
    .populate('userId', 'firstName lastName email')
    .populate('tirageId', 'type date')
    .sort({ createdAt: -1 })
    .limit(limit);
};

feedbackSchema.statics.getCategoryStats = async function() {
  return this.aggregate([
    { $match: { status: 'approved' } },
    { $unwind: '$categories' },
    {
      $group: {
        _id: '$categories',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

feedbackSchema.statics.getImprovementSuggestions = async function(limit = 20) {
  return this.aggregate([
    { $match: { status: 'approved' } },
    { $unwind: '$improvements' },
    {
      $group: {
        _id: '$improvements',
        count: { $sum: 1 },
        examples: { $push: { comment: '$comment', rating: '$rating' } }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
};

module.exports = mongoose.model('Feedback', feedbackSchema);
