const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Informations de base
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères']
  },
  
  // Profil
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true,
    maxlength: [50, 'Le prénom ne peut pas dépasser 50 caractères']
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères']
  },
  
  // Rôles et permissions
  role: {
    type: String,
    enum: ['visitor', 'client', 'member', 'admin'],
    default: 'visitor'
  },
  
  // Statut abonnement
  subscriptionActive: {
    type: Boolean,
    default: false
  },
  subscriptionType: {
    type: String,
    enum: ['none', 'traversee', 'tore'],
    default: 'none'
  },
  subscriptionExpiresAt: {
    type: Date
  },
  
  // Consentements
  consentements: {
    newsletter: {
      type: Boolean,
      default: false
    },
    analytics: {
      type: Boolean,
      default: true
    },
    marketing: {
      type: Boolean,
      default: false
    }
  },
  
  // Profil étendu
  profile: {
    phone: String,
    birthDate: Date,
    humanDesign: String,
    enneagramme: String,
    astrologie: String,
    numerologie: String,
    preferences: {
      language: {
        type: String,
        enum: ['fr', 'en'],
        default: 'fr'
      },
      timezone: {
        type: String,
        default: 'Europe/Paris'
      },
      emailNotifications: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // Statistiques
  stats: {
    tiragesCount: {
      type: Number,
      default: 0
    },
    lastTirageDate: Date,
    totalSpent: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0
    },
    feedbacksCount: {
      type: Number,
      default: 0
    }
  },
  
  // Sessions et sécurité
  lastLogin: Date,
  loginCount: {
    type: Number,
    default: 0
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  
  // Notes admin
  adminNotes: {
    type: String,
    maxlength: 1000
  },
  
  // Soft delete
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.resetPasswordToken;
      delete ret.emailVerificationToken;
      return ret;
    }
  }
});

// Virtuals
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual('age').get(function() {
  if (!this.profile.birthDate) return null;
  const today = new Date();
  const birthDate = new Date(this.profile.birthDate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'stats.tiragesCount': -1 });
userSchema.index({ subscriptionActive: 1 });

// Middleware
userSchema.pre('save', async function(next) {
  // Hash password si modifié
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.pre('save', function(next) {
  // Update lastLogin si c'est une connexion
  if (this.isModified('lastLogin') && this.lastLogin) {
    this.loginCount = (this.loginCount || 0) + 1;
  }
  next();
});

// Méthodes d'instance
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getTiragesInPeriod = function(startDate, endDate) {
  return mongoose.model('Tirage').find({
    userId: this._id,
    date: { $gte: startDate, $lte: endDate }
  });
};

userSchema.methods.updateStats = async function() {
  const tirages = await mongoose.model('Tirage').find({ userId: this._id });
  const feedbacks = await mongoose.model('Feedback').find({ userId: this._id });
  
  this.stats.tiragesCount = tirages.length;
  this.stats.lastTirageDate = tirages.length > 0 ? tirages[tirages.length - 1].date : null;
  this.stats.feedbacksCount = feedbacks.length;
  
  if (feedbacks.length > 0) {
    const totalRating = feedbacks.reduce((sum, f) => sum + (f.rating || 0), 0);
    this.stats.averageRating = totalRating / feedbacks.length;
  }
  
  await this.save();
};

// Méthodes statiques
userSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        totalMembers: { $sum: { $cond: [{ $eq: ['$subscriptionActive', true] }, 1, 0] } },
        newUsersThisMonth: {
          $sum: {
            $cond: [
              { $gte: ['$createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalUsers: 0,
    activeUsers: 0,
    totalMembers: 0,
    newUsersThisMonth: 0
  };
};

userSchema.statics.getRoleDistribution = async function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model('User', userSchema);
