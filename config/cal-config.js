/**
 * Configuration Cal.com pour Oradia
 * Fichier de configuration centralisé pour le système de réservation
 */

const CAL_CONFIG = {
  // Configuration principale Cal.com
  cal: {
    // Remplacer par votre véritable lien Cal.com
    link: 'oradia/guidance-spirituelle',
    
    // Namespace pour éviter les conflits
    namespace: 'oradia',
    
    // URL de l'API Cal.com
    apiUrl: 'https://app.cal.com',
    
    // Options d'intégration
    embed: {
      theme: 'dark',
      branding: {
        brandColor: '#d4af37',
        dark: true
      },
      layout: {
        showEventTypeDetails: false,
        hideEventTypeDetails: false
      }
    }
  },

  // Configuration Jitsi Meet
  jitsi: {
    // URL du serveur Jitsi (optionnel - Cal.com peut utiliser le sien)
    serverUrl: 'meet.jit.si',
    
    // Options de configuration Jitsi
    options: {
      roomNamePrefix: 'oradia-',
      requireDisplayName: true,
      startWithAudioMuted: false,
      startWithVideoMuted: true
    }
  },

  // Configuration des types de rendez-vous
  eventTypes: [
    {
      id: 'guidance-personnelle',
      name: 'Guidance Personnelle',
      description: 'Session individuelle de guidance personnelle',
      duration: 60, // minutes
      price: 60, // €
      currency: 'EUR',
      location: 'Visioconférence Jitsi Meet',
      color: '#d4af37'
    },
    {
      id: 'guidance-approfondie',
      name: 'Guidance Approfondie',
      description: 'Session de 90min pour exploration en profondeur',
      duration: 90, // minutes
      price: 90, // €
      currency: 'EUR',
      location: 'Visioconférence Jitsi Meet',
      color: '#f4e4c1'
    },
    {
      id: 'accompagnement-cercle',
      name: 'Accompagnement Cercle',
      description: 'Participation à un cercle de parole en groupe',
      duration: 120, // minutes
      price: 30, // €
      currency: 'EUR',
      location: 'Visioconférence Jitsi Meet',
      color: '#8b7355'
    },
    {
      id: 'consultation-rapide',
      name: 'Consultation Rapide',
      description: 'Session de 30min pour question ciblée',
      duration: 30, // minutes
      price: 30, // €
      currency: 'EUR',
      location: 'Visioconférence Jitsi Meet',
      color: '#654321'
    }
  ],

  // Configuration des redirections
  redirects: {
    success: 'confirmation-rendez-vous.html',
    cancel: 'rendez-vous.html',
    reschedule: 'rendez-vous.html'
  },

  // Configuration des emails
  emails: {
    // Templates d'emails personnalisés (optionnel)
    templates: {
      confirmation: {
        subject: 'Votre rendez-vous Oradia est confirmé',
        includeJitsiLink: true
      },
      reminder: {
        subject: 'Rappel : Votre rendez-vous Oradia approche',
        includeJitsiLink: true
      }
    }
  },

  // Configuration du temps
  timezone: 'Europe/Paris',
  
  // Jours et heures disponibles
  availability: {
    days: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    timeSlots: [
      { start: '09:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
      { start: '19:00', end: '21:00' }
    ]
  },

  // Configuration des notifications
  notifications: {
    // Rappels automatiques
    reminders: [
      { type: 'email', minutes: 1440 }, // 24h avant
      { type: 'email', minutes: 60 }   // 1h avant
    ]
  }
};

// Exporter la configuration
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CAL_CONFIG;
} else {
  window.CAL_CONFIG = CAL_CONFIG;
}
