/**
 * Script pour mettre à jour les identifiants de l'administrateur
 * Utilisez ce script si la base de données contient déjà des données
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const updateAdminCredentials = async () => {
  try {
    // Connexion à la base de données
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/oradia', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    // console.log(console.log('✅ Connecté à MongoDB');)

    // Chercher l'admin existant
    const existingAdmin = await User.findOne({ role: 'admin' });
    
    if (existingAdmin) {
      // Mettre à jour l'email et le mot de passe
      const newPassword = await bcrypt.hash('RafalE12#12', 12);
      
      existingAdmin.email = 'Oradia@protonmail.com';
      existingAdmin.password = newPassword;
      
      await existingAdmin.save();
      
      // console.log(console.log('✅ Administrateur mis à jour avec succès:');)
      // console.log(console.log('   📧 Email: Oradia@protonmail.com');)
      // console.log(console.log('   🔐 Mot de passe: RafalE12#12');)
    } else {
      // Créer un nouvel admin si aucun n'existe
      const adminPassword = await bcrypt.hash('RafalE12#12', 12);
      const admin = new User({
        email: 'Oradia@protonmail.com',
        password: adminPassword,
        firstName: 'Admin',
        lastName: 'ORADIA',
        role: 'admin',
        consentements: {
          newsletter: true,
          analytics: true,
          marketing: false
        }
      });
      
      await admin.save();
      // console.log(console.log('✅ Nouvel administrateur créé:');)
      // console.log(console.log('   📧 Email: Oradia@protonmail.com');)
      // console.log(console.log('   🔐 Mot de passe: RafalE12#12');)
    }

  } catch (error) {
    // console.error(console.error('❌ Erreur lors de la mise à jour de l\'administrateur:', error);)
  } finally {
    mongoose.disconnect();
  }
};

// Exécuter la mise à jour
updateAdminCredentials();
