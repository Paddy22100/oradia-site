/**
 * Script de création d'utilisateur dans MongoDB
 * Usage: node server/scripts/create-user-mongodb.js
 */

try {
  require('dotenv').config();
} catch (e) {}

const mongoose = require('mongoose');
const path = require('path');

const serverDir = path.resolve(__dirname, '..');
const User = require(path.join(serverDir, 'models', 'User'));
const { Subscription } = require(path.join(serverDir, 'models', 'Freemium'));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oradia';

const USER_DATA = {
  email: 'contact@oradia.fr',
  password: 'Oradia2026!',
  firstName: 'Contact',
  lastName: 'Oradia',
  role: 'member',
  subscriptionActive: true,
  subscriptionType: 'tore',
  emailVerified: true,
  consentements: {
    newsletter: true,
    analytics: true,
    marketing: false
  }
};

async function createUser() {
  try {
    console.log('Connexion à MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connecté à MongoDB');

    // Vérifier si l'utilisateur existe
    let user = await User.findOne({ email: USER_DATA.email });
    
    if (user) {
      console.log(`\nL'utilisateur ${USER_DATA.email} existe déjà.`);
      console.log('Mise à jour des informations...');
      
      user.password = USER_DATA.password;
      user.subscriptionActive = USER_DATA.subscriptionActive;
      user.subscriptionType = USER_DATA.subscriptionType;
      user.emailVerified = USER_DATA.emailVerified;
      user.role = USER_DATA.role;
      
      await user.save();
      console.log('✓ Utilisateur mis à jour');
    } else {
      console.log(`\nCréation de l'utilisateur ${USER_DATA.email}...`);
      user = new User(USER_DATA);
      await user.save();
      console.log('✓ Utilisateur créé avec succès');
    }

    // Créer ou mettre à jour l'abonnement
    let subscription = await Subscription.findOne({ userId: user._id });
    
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 100);
    
    if (subscription) {
      subscription.status = 'active';
      subscription.currentPeriodStart = new Date();
      subscription.currentPeriodEnd = farFuture;
      subscription.cancelAtPeriodEnd = false;
      subscription.stripeSubscriptionId = 'MANUAL-LIFETIME';
      subscription.stripeCustomerId = 'MANUAL-CUSTOMER';
      await subscription.save();
      console.log('✓ Abonnement mis à jour');
    } else {
      subscription = new Subscription({
        userId: user._id,
        plan: 'tore',
        status: 'active',
        stripeSubscriptionId: 'MANUAL-LIFETIME',
        stripeCustomerId: 'MANUAL-CUSTOMER',
        currentPeriodStart: new Date(),
        currentPeriodEnd: farFuture,
        cancelAtPeriodEnd: false
      });
      await subscription.save();
      console.log('✓ Abonnement créé');
    }

    console.log('\n========================================');
    console.log('✓ COMPTE CRÉÉ DANS MONGODB');
    console.log('========================================');
    console.log(`Email: ${USER_DATA.email}`);
    console.log(`Mot de passe: ${USER_DATA.password}`);
    console.log(`Abonnement: ${USER_DATA.subscriptionType} (actif)`);
    console.log('========================================\n');

  } catch (error) {
    console.error('\n✗ ERREUR:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Déconnexion de MongoDB');
  }
}

createUser();
