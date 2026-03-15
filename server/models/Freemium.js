const mongoose = require('mongoose');

// Schéma pour les crédits de Traversée
const creditSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  credits: {
    type: Number,
    default: 0,
    min: 0
  },
  totalPurchased: {
    type: Number,
    default: 0
  },
  lastPurchase: {
    type: Date,
    default: null
  },
  purchaseHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    credits: Number,
    amount: Number,
    stripePaymentId: String
  }]
}, {
  timestamps: true
});

// Schéma pour les abonnements Tore
const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  plan: {
    type: String,
    enum: ['tore'],
    default: 'tore'
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'past_due'],
    default: 'active'
  },
  stripeSubscriptionId: {
    type: String,
    required: true
  },
  stripeCustomerId: {
    type: String,
    required: true
  },
  currentPeriodStart: {
    type: Date,
    required: true
  },
  currentPeriodEnd: {
    type: Date,
    required: true
  },
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  trialEnd: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Schéma pour le suivi des appareils (protection anti-abus)
const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  fingerprint: {
    type: String,
    required: true
  },
  userAgent: String,
  ip: String,
  lastSeen: {
    type: Date,
    default: Date.now
  },
  freeReadingsCount: {
    type: Number,
    default: 0
  },
  accountsCreated: {
    type: Number,
    default: 0
  },
  blocked: {
    type: Boolean,
    default: false
  },
  blockReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index pour optimiser les requêtes
creditSchema.index({ userId: 1 });
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ fingerprint: 1 });
deviceSchema.index({ ip: 1 });
deviceSchema.index({ blocked: 1 });

// Méthodes du modèle Crédit
creditSchema.methods.useCredit = async function() {
  if (this.credits <= 0) {
    throw new Error('Aucun crédit disponible');
  }
  
  this.credits -= 1;
  await this.save();
  
  return this.credits;
};

creditSchema.methods.addCredits = async function(amount, stripePaymentId, purchaseAmount) {
  this.credits += amount;
  this.totalPurchased += amount;
  this.lastPurchase = new Date();
  
  this.purchaseHistory.push({
    credits: amount,
    amount: purchaseAmount,
    stripePaymentId: stripePaymentId
  });
  
  await this.save();
  return this.credits;
};

// Méthodes du modèle Abonnement
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && 
         this.currentPeriodEnd > new Date() &&
         !this.cancelAtPeriodEnd;
};

subscriptionSchema.methods.cancel = async function() {
  this.cancelAtPeriodEnd = true;
  await this.save();
};

// Méthodes statiques pour le suivi des appareils
deviceSchema.statics.findByFingerprint = function(fingerprint) {
  return this.findOne({ fingerprint, blocked: false });
};

deviceSchema.statics.findByIp = function(ip) {
  return this.find({ ip, blocked: false });
};

deviceSchema.methods.incrementFreeReadings = async function() {
  this.freeReadingsCount += 1;
  this.lastSeen = new Date();
  
  // Bloquer après 5 tirages gratuits par appareil
  if (this.freeReadingsCount >= 5) {
    this.blocked = true;
    this.blockReason = 'Limite de tirages gratuits atteinte';
  }
  
  await this.save();
  return this.freeReadingsCount;
};

deviceSchema.methods.incrementAccountsCreated = async function() {
  this.accountsCreated += 1;
  this.lastSeen = new Date();
  
  // Bloquer après 3 comptes créés par appareil
  if (this.accountsCreated >= 3) {
    this.blocked = true;
    this.blockReason = 'Trop de comptes créés depuis cet appareil';
  }
  
  await this.save();
  return this.accountsCreated;
};

const Credit = mongoose.model('Credit', creditSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);
const Device = mongoose.model('Device', deviceSchema);

module.exports = {
  Credit,
  Subscription,
  Device
};
