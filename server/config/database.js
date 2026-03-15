const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/oradia', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // console.log(console.log(`✅ MongoDB Connecté: ${conn.connection.host}`);)
    
    // Créer les indexes pour optimiser les performances
    await createIndexes();
    
  } catch (error) {
    // console.error(console.error('❌ Erreur de connexion MongoDB:', error.message);)
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    // Index pour les utilisateurs
    await mongoose.connection.db.collection('users').createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.db.collection('users').createIndex({ role: 1 });
    await mongoose.connection.db.collection('users').createIndex({ createdAt: -1 });
    
    // Index pour les tirages
    await mongoose.connection.db.collection('tirages').createIndex({ userId: 1 });
    await mongoose.connection.db.collection('tirages').createIndex({ type: 1 });
    await mongoose.connection.db.collection('tirages').createIndex({ date: -1 });
    await mongoose.connection.db.collection('tirages').createIndex({ userId: 1, date: -1 });
    
    // Index pour les feedbacks
    await mongoose.connection.db.collection('feedbacks').createIndex({ userId: 1 });
    await mongoose.connection.db.collection('feedbacks').createIndex({ tirageId: 1 });
    await mongoose.connection.db.collection('feedbacks').createIndex({ createdAt: -1 });
    await mongoose.connection.db.collection('feedbacks').createIndex({ rating: 1 });
    
    // Index pour les newsletters
    await mongoose.connection.db.collection('newsletters').createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.db.collection('newsletters').createIndex({ active: 1 });
    await mongoose.connection.db.collection('newsletters').createIndex({ segments: 1 });
    
    // console.log(console.log('✅ Index MongoDB créés avec succès');)
  } catch (error) {
    // console.error(console.error('❌ Erreur création indexes:', error.message);)
  }
};

module.exports = connectDB;
