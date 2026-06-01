/**
 * Script de création d'utilisateur admin/contact
 * 
 * Usage: node server/scripts/create-admin-user.js
 * 
 * Crée un utilisateur avec:
 * - Email: contact@oradia.fr
 * - Mot de passe: Oradia2026!
 * - Rôle: admin
 * - Abonnement Tore actif
 */

try {
  require('dotenv').config();
} catch (e) {
  // dotenv n'est pas installé, on continue sans
}

const mongoose = require('mongoose');
const path = require('path');

// Configuration des chemins
const serverDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(serverDir, '..');

// Charger les modèles
const User = require(path.join(serverDir, 'models', 'User'));
const { Subscription } = require(path.join(serverDir, 'models', 'Freemium'));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oradia';

const USER_DATA = {
  email: 'contact@oradia.fr',
  password: 'Oradia2026!',
  firstName: 'Contact',
  lastName: 'Oradia',
  role: 'admin',
  subscriptionActive: true,
  subscriptionType: 'tore',
  emailVerified: true,
  consentements: {
    newsletter: true,
    analytics: true,
    marketing: false
  }
};

async function createAdminUser() {
  try {
    console.log('Connexion à la base de données...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connecté à MongoDB');

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email: USER_DATA.email });
    
    if (existingUser) {
      console.log(`\nL'utilisateur ${USER_DATA.email} existe déjà.`);
      console.log('Mise à jour du mot de passe et des permissions...');
      
      // Mettre à jour l'utilisateur existant
      existingUser.password = USER_DATA.password;
      existingUser.role = USER_DATA.role;
      existingUser.subscriptionActive = USER_DATA.subscriptionActive;
      existingUser.subscriptionType = USER_DATA.subscriptionType;
      existingUser.emailVerified = USER_DATA.emailVerified;
      
      await existingUser.save();
      console.log('✓ Utilisateur mis à jour');
      
      // Créer ou mettre à jour l'abonnement
      await createOrUpdateSubscription(existingUser._id);
      
    } else {
      console.log(`\nCréation de l'utilisateur ${USER_DATA.email}...`);
      
      // Créer le nouvel utilisateur
      const newUser = new User(USER_DATA);
      await newUser.save();
      console.log('✓ Utilisateur créé avec succès');
      
      // Créer l'abonnement Tore
      await createOrUpdateSubscription(newUser._id);
    }

    console.log('\n========================================');
    console.log('✓ COMPTE ADMIN CRÉÉ AVEC SUCCÈS');
    console.log('========================================');
    console.log(`Email: ${USER_DATA.email}`);
    console.log(`Mot de passe: ${USER_DATA.password}`);
    console.log(`Rôle: ${USER_DATA.role}`);
    console.log('Abonnement Tore: ACTIF (illimité)');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n✗ ERREUR:', error.message);
    if (error.code === 11000) {
      console.error('L\'email existe déjà avec des données différentes.');
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Déconnexion de MongoDB');
  }
}

async function createOrUpdateSubscription(userId) {
  try {
    let subscription = await Subscription.findOne({ userId });
    
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 100);
    
    if (subscription) {
      // Mettre à jour l'abonnement existant
      subscription.status = 'active';
      subscription.currentPeriodStart = new Date();
      subscription.currentPeriodEnd = farFuture;
      subscription.cancelAtPeriodEnd = false;
      await subscription.save();
      console.log('✓ Abonnement Tore mis à jour (illimité)');
    } else {
      // Créer un nouvel abonnement
      subscription = new Subscription({
        userId,
        plan: 'tore',
        status: 'active',
        stripeSubscriptionId: 'ADMIN-LIFETIME-ACCESS',
        stripeCustomerId: 'ADMIN-CUSTOMER',
        currentPeriodStart: new Date(),
        currentPeriodEnd: farFuture,
        cancelAtPeriodEnd: false
      });
      await subscription.save();
      console.log('✓ Abonnement Tore créé (illimité)');
    }
  } catch (error) {
    console.error('Erreur lors de la création de l\'abonnement:', error.message);
    throw error;
  }
}

// Exécuter le script
createAdminUser();
