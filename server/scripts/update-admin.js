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
    
    // Vérifier que les variables d'environnement sont définies
    const adminEmail = process.env.ADMIN_EMAIL || 'Oradia@protonmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('❌ ERREUR: Variable ADMIN_PASSWORD non définie dans .env');
      console.error('   Définissez ADMIN_PASSWORD dans votre fichier .env');
      process.exit(1);
    }

    if (existingAdmin) {
      // Mettre à jour l'email et le mot de passe
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      
      existingAdmin.email = adminEmail;
      existingAdmin.password = hashedPassword;
      
      await existingAdmin.save();
      
      console.log('✅ Administrateur mis à jour avec succès');
      console.log(`   📧 Email: ${adminEmail}`);
      console.log('   🔐 Mot de passe: [PROTÉGÉ]');
    } else {
      // Créer un nouvel admin si aucun n'existe
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      const admin = new User({
        email: adminEmail,
        password: hashedPassword,
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
      console.log('✅ Nouvel administrateur créé');
      console.log(`   📧 Email: ${adminEmail}`);
      console.log('   🔐 Mot de passe: [PROTÉGÉ]');
    }

  } catch (error) {
    // console.error(console.error('❌ Erreur lors de la mise à jour de l\'administrateur:', error);)
  } finally {
    mongoose.disconnect();
  }
};

// Exécuter la mise à jour
updateAdminCredentials();
