const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Tirage = require('../models/Tirage');
const Feedback = require('../models/Feedback');
const Newsletter = require('../models/Newsletter');
require('dotenv').config();

// Connect to database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/oradia', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Seed data
const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // Clear existing data
    await User.deleteMany({});
    await Tirage.deleteMany({});
    await Feedback.deleteMany({});
    await Newsletter.deleteMany({});
    
    console.log('🧹 Cleared existing data');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = new User({
      email: 'admin@oradia.com',
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
    console.log('👤 Created admin user: admin@oradia.com / admin123');

    // Create test users
    const testUsers = [];
    const userRoles = ['visitor', 'client', 'member'];
    const firstNames = ['Marie', 'Jean', 'Sophie', 'Pierre', 'Claire', 'Lucas', 'Emma', 'Thomas'];
    const lastNames = ['Martin', 'Bernard', 'Dubois', 'Petit', 'Robert', 'Richard', 'Durand', 'Leroy'];

    for (let i = 0; i < 20; i++) {
      const password = await bcrypt.hash('password123', 12);
      const user = new User({
        email: `user${i + 1}@test.com`,
        password,
        firstName: firstNames[i % firstNames.length],
        lastName: lastNames[i % lastNames.length],
        role: userRoles[i % userRoles.length],
        subscriptionActive: Math.random() > 0.7,
        subscriptionType: Math.random() > 0.7 ? 'tore' : Math.random() > 0.5 ? 'traversee' : 'none',
        consentements: {
          newsletter: Math.random() > 0.5,
          analytics: true,
          marketing: Math.random() > 0.8
        },
        profile: {
          phone: `06${Math.floor(Math.random() * 10000000).toString().padStart(8, '0')}`,
          birthDate: new Date(1980 + Math.floor(Math.random() * 30), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
          preferences: {
            language: 'fr',
            timezone: 'Europe/Paris',
            emailNotifications: Math.random() > 0.3
          }
        }
      });
      await user.save();
      testUsers.push(user);
    }
    console.log(`👥 Created ${testUsers.length} test users`);

    // Create sample tirages
    const tirageTypes = ['pelerin', 'traversee', 'tore'];
    const tirages = [];
    
    for (const user of testUsers) {
      const tirageCount = Math.floor(Math.random() * 5) + 1;
      
      for (let i = 0; i < tirageCount; i++) {
        const tirageType = tirageTypes[Math.floor(Math.random() * tirageTypes.length)];
        const tirageDate = new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000);
        
        const tirage = new Tirage({
          userId: user._id,
          type: tirageType,
          intention: `Question ${i + 1} pour ${user.firstName}`,
          cards: generateSampleCards(tirageType),
          synthese: {
            vibratoire: 'Énergie d\'harmonie et d\'équilibre',
            message: 'Votre chemin s\'éclaire avec clarté et sagesse',
            mantra: 'Je suis en paix avec mon cheminement',
            questionIntrospection: 'Quelle leçon puis-je tirer de cette expérience ?',
            conseils: [
              'Prenez le temps d\'intégrer ces messages',
              'Faites confiance à votre intuition',
              'Soyez patient avec vous-même'
            ]
          },
          pricing: {
            amount: tirageType === 'pelerin' ? 0 : tirageType === 'traversee' ? 5 : 8,
            currency: 'EUR',
            paid: Math.random() > 0.2,
            paymentMethod: tirageType === 'pelerin' ? 'free' : 'stripe'
          },
          date: tirageDate,
          status: 'termine',
          metadata: {
            duration: Math.floor(Math.random() * 600) + 60,
            device: Math.random() > 0.5 ? 'desktop' : 'mobile',
            browser: 'Chrome'
          }
        });
        
        await tirage.save();
        tirages.push(tirage);
      }
    }
    console.log(`🎲 Created ${tirages.length} sample tirages`);

    // Create sample feedbacks
    const feedbacks = [];
    const satisfactions = ['tres_insatisfait', 'insatisfait', 'neutre', 'satisfait', 'tres_satisfait'];
    const pertinences = ['non_pertinent', 'peu_pertinent', 'pertinent', 'tres_pertinent'];
    const clarities = ['confus', 'peu_clair', 'clair', 'tres_clair'];
    
    for (const tirage of tirages) {
      if (Math.random() > 0.3) { // 70% chance of having feedback
        const feedback = new Feedback({
          userId: tirage.userId,
          tirageId: tirage._id,
          rating: Math.floor(Math.random() * 3) + 3, // 3-5 stars
          comment: generateSampleComment(),
          satisfaction: satisfactions[Math.floor(Math.random() * satisfactions.length)],
          pertinence: pertinences[Math.floor(Math.random() * pertinences.length)],
          clarity: clarities[Math.floor(Math.random() * clarities.length)],
          helpful: Math.random() > 0.2,
          wouldRecommend: Math.random() > 0.3,
          synchronicite: Math.random() > 0.4,
          synchroniciteDetails: Math.random() > 0.4 ? generateSynchroniciteDetails() : '',
          improvements: Math.random() > 0.6 ? [generateImprovement()] : [],
          likedElements: Math.random() > 0.5 ? [generateLikedElement()] : [],
          metadata: {
            device: 'desktop',
            responseTime: Math.random() * 72 + 1 // 1-72 hours
          }
        });
        
        await feedback.save();
        feedbacks.push(feedback);
      }
    }
    console.log(`💬 Created ${feedbacks.length} sample feedbacks`);

    // Create newsletter subscribers
    const subscribers = [];
    for (let i = 0; i < 30; i++) {
      const subscriber = new Newsletter({
        email: `subscriber${i + 1}@newsletter.com`,
        userId: Math.random() > 0.5 ? testUsers[Math.floor(Math.random() * testUsers.length)]._id : undefined,
        active: Math.random() > 0.1,
        segments: ['visitors', Math.random() > 0.5 ? 'pelerin_users' : '', Math.random() > 0.7 ? 'members' : ''].filter(Boolean),
        preferences: {
          frequency: ['daily', 'weekly', 'monthly'][Math.floor(Math.random() * 3)],
          contentTypes: ['oracle_updates', 'tirage_tips', 'special_offers'].slice(0, Math.floor(Math.random() * 3) + 1),
          language: 'fr'
        },
        stats: {
          totalEmailsSent: Math.floor(Math.random() * 20),
          totalEmailsOpened: Math.floor(Math.random() * 15),
          totalEmailsClicked: Math.floor(Math.random() * 8),
          openRate: Math.random() * 80,
          clickRate: Math.random() * 30,
          engagementScore: Math.random() * 100
        },
        source: ['footer_signup', 'contact_form', 'tirage_form', 'user_registration'][Math.floor(Math.random() * 4)],
        metadata: {
          device: Math.random() > 0.5 ? 'desktop' : 'mobile'
        }
      });
      
      await subscriber.save();
      subscribers.push(subscriber);
    }
    console.log(`📧 Created ${subscribers.length} newsletter subscribers`);

    // Update user statistics
    for (const user of testUsers) {
      await user.updateStats();
    }

    console.log('✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   👤 Users: ${testUsers.length + 1} (including admin)`);
    console.log(`   🎲 Tirages: ${tirages.length}`);
    console.log(`   💬 Feedbacks: ${feedbacks.length}`);
    console.log(`   📧 Subscribers: ${subscribers.length}`);
    console.log('\n🔑 Login credentials:');
    console.log('   Admin: admin@oradia.com / admin123');
    console.log('   Test users: user1@test.com to user20@test.com / password123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    mongoose.disconnect();
  }
};

// Helper functions
function generateSampleCards(type) {
  const allCards = [
    { position: 'Passé', cardName: 'L\'Ancêtre', category: 'memoire', meaning: 'Mémoire transgénérationnelle', interpretation: 'Les héritages du passé vous guident' },
    { position: 'Présent', cardName: 'Le Gardien', category: 'emotion', meaning: 'Protection intérieure', interpretation: 'Votre force intérieure veille sur vous' },
    { position: 'Futur', cardName: 'L\'Étoile', category: 'revelation', meaning: 'Guidance céleste', interpretation: 'Votre chemin est illuminé' },
    { position: 'Action', cardName: 'Le Messager', category: 'action', meaning: 'Communication divine', interpretation: 'Le message doit être partagé' },
    { position: 'Nord', cardName: 'La Boussole', category: 'revelation', meaning: 'Direction spirituelle', interpretation: 'Votre nord intérieur vous guide' },
    { position: 'Sud', cardName: 'Le Feu', category: 'emotion', meaning: 'Passion créatrice', interpretation: 'Votre passion vous transforme' },
    { position: 'Est', cardName: 'L\'Aube', category: 'besoin', meaning: 'Nouveau départ', interpretation: 'Chaque jour est une renaissance' },
    { position: 'Ouest', cardName: 'Le Crépuscule', category: 'transmutation', meaning: 'Transition sacrée', interpretation: 'Les fins sont des commencements' }
  ];

  if (type === 'pelerin') {
    return allCards.slice(0, 3);
  } else if (type === 'traversee') {
    return allCards.slice(3, 7);
  } else {
    return allCards;
  }
}

function generateSampleComment() {
  const comments = [
    'Ce tirage m\'a vraiment aidé à y voir plus clair dans ma situation actuelle.',
    'Les cartes étaient très pertinentes et correspondaient exactement à ce que je vis.',
    'Une expérience profonde et transformative. Je me sens plus alignée.',
    'Les messages étaient justes et m\'ont apporté un grand réconfort.',
    'Très impressionnée par la précision du tirage. Merci beaucoup!',
    'Ce tirage m\'a permis de prendre une décision importante avec confiance.',
    'Les conseils étaient très justes et applicables dans ma vie quotidienne.',
    'Une belle synchronicité entre les cartes et ma situation du moment.'
  ];
  
  return comments[Math.floor(Math.random() * comments.length)];
}

function generateSynchroniciteDetails() {
  const details = [
    'Le lendemain du tirage, j\'ai rencontré une personne qui incarnait parfaitement le message de la carte Gardien.',
    'Une situation inattendue s\'est présentée, confirmant la prédiction de la carte Étoile.',
    'J\'ai rêvé de symboles qui correspondaient exactement aux cartes tirées.',
    'Une conversation avec un ami a fait écho aux messages reçus.',
    'J\'ai trouvé un objet qui symbolisait la guidance reçue.',
    'Une coïncidence remarquable a validé l\'interprétation du tirage.',
    'Les événements de la semaine ont suivi la direction indiquée.',
    'Une intuition forte s\'est confirmée après le tirage.'
  ];
  
  return details[Math.floor(Math.random() * details.length)];
}

function generateImprovement() {
  const improvements = [
    'Plus de détails sur l\'interprétation des cartes',
    'Suggestions concrètes pour l\'intégration',
    'Exercices pratiques après le tirage',
    'Guide méditatif pour intégrer les messages',
    'Plus de contexte sur chaque carte',
    'Exemples de situations similaires',
    'Ressources complémentaires',
    'Suivi personnalisé'
  ];
  
  return improvements[Math.floor(Math.random() * improvements.length)];
}

function generateLikedElement() {
  const likedElements = [
    'La clarté des messages',
    'La bienveillance de l\'approche',
    'La profondeur de l\'analyse',
    'Les conseils pratiques',
    'L\'aspect spirituel',
    'La pertinence des cartes',
    'L\'énergie du tirage',
    'La qualité de l\'interprétation'
  ];
  
  return likedElements[Math.floor(Math.random() * likedElements.length)];
}

// Run seeding
seedData();
