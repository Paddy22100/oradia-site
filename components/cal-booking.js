/**
 * Composant d'intégration Cal.com pour Oradia
 * Gère l'embed Cal.com et la redirection vers la page de confirmation
 */

class CalComBooking {
  constructor(options = {}) {
    this.options = {
      calLink: options.calLink || 'oradia/guidance-spirituelle',
      namespace: options.namespace || 'oradia',
      redirectUrl: options.redirectUrl || 'confirmation-rendez-vous.html',
      ...options
    };
    
    this.init();
  }

  init() {
    this.loadCalComEmbed();
    this.setupEventListeners();
    this.setupFallback();
  }

  /**
   * Charge l'embed Cal.com
   */
  loadCalComEmbed() {
    // Créer le script Cal.com
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://app.cal.com/embed/embed.js';
    script.async = true;
    
    script.onload = () => {
      console.log('Cal.com embed loaded successfully');
      this.setupCalEmbed();
    };
    
    script.onerror = () => {
      console.error('Failed to load Cal.com embed');
      this.showFallback();
    };
    
    document.head.appendChild(script);
  }

  /**
   * Configure l'embed Cal.com
   */
  setupCalEmbed() {
    // Configuration de l'embed Cal.com
    if (window.Cal) {
      window.Cal('init', {
        origin: 'https://app.cal.com',
        embed: 'cal-embed',
        namespace: this.options.namespace
      });
      
      window.Cal('ui', {
        styles: {
          branding: {
            brandColor: '#d4af37',
            dark: true
          },
          layout: {
            showEventTypeDetails: false,
            hideEventTypeDetails: false
          }
        },
        config: {
          name: 'Oradia',
          description: 'Session de guidance spirituelle',
          theme: 'dark'
        }
      });
    }
  }

  /**
   * Met en place les écouteurs d'événements
   */
  setupEventListeners() {
    // Écouter les messages de Cal.com
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'cal:booking:completed') {
        this.handleBookingCompleted(event.data);
      }
      
      if (event.data && event.data.type === 'cal:booking:failed') {
        this.handleBookingFailed(event.data);
      }
    });

    // Surveiller les changements d'URL (fallback)
    this.monitorUrlChanges();
  }

  /**
   * Gère la réservation réussie
   */
  handleBookingCompleted(data) {
    console.log('Booking completed:', data);
    
    // Stocker les informations de réservation
    const bookingData = {
      eventId: data.eventId,
      startTime: data.startTime,
      endTime: data.endTime,
      attendeeEmail: data.attendeeEmail,
      status: 'confirmed'
    };
    
    sessionStorage.setItem('oradia_booking', JSON.stringify(bookingData));
    
    // Rediriger vers la page de confirmation
    setTimeout(() => {
      window.location.href = this.options.redirectUrl;
    }, 1000);
  }

  /**
   * Gère l'échec de réservation
   */
  handleBookingFailed(data) {
    console.error('Booking failed:', data);
    
    // Afficher un message d'erreur
    this.showErrorMessage('Une erreur est survenue lors de la réservation. Veuillez réessayer.');
  }

  /**
   * Surveille les changements d'URL (méthode fallback)
   */
  monitorUrlChanges() {
    let currentUrl = window.location.href;
    
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        
        // Vérifier si l'URL contient des indicateurs de succès
        if (currentUrl.includes('success') || currentUrl.includes('confirmed')) {
          this.handleBookingCompleted({
            type: 'cal:booking:completed',
            url: currentUrl
          });
        }
      }
    }, 1000);
  }

  /**
   * Affiche le fallback si Cal.com ne charge pas
   */
  setupFallback() {
    // Vérifier après 5 secondes si Cal.com est chargé
    setTimeout(() => {
      const calEmbed = document.getElementById('cal-embed');
      if (calEmbed && calEmbed.children.length === 0) {
        this.showFallback();
      }
    }, 5000);
  }

  /**
   * Affiche le fallback
   */
  showFallback() {
    const calEmbed = document.getElementById('cal-embed');
    const fallback = document.getElementById('cal-fallback');
    
    if (calEmbed) calEmbed.style.display = 'none';
    if (fallback) fallback.classList.remove('hidden');
  }

  /**
   * Affiche un message d'erreur
   */
  showErrorMessage(message) {
    // Créer ou mettre à jour une div d'erreur
    let errorDiv = document.getElementById('cal-error');
    
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.id = 'cal-error';
      errorDiv.className = 'bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg mb-4';
      
      const calContainer = document.querySelector('.cal-embed-container');
      if (calContainer) {
        calContainer.insertBefore(errorDiv, calContainer.firstChild);
      }
    }
    
    errorDiv.innerHTML = `
      <div class="flex items-center">
        <i class="fas fa-exclamation-triangle mr-3"></i>
        <span>${message}</span>
      </div>
    `;
    
    // Faire disparaître le message après 5 secondes
    setTimeout(() => {
      if (errorDiv) {
        errorDiv.remove();
      }
    }, 5000);
  }

  /**
   * Personnalise l'apparence de l'embed
   */
  customizeStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #cal-embed {
        background: rgba(26,54,93,0.3) !important;
        border: 1px solid rgba(212,175,55,0.3) !important;
        border-radius: 18px !important;
        backdrop-filter: blur(10px) !important;
      }
      
      #cal-embed iframe {
        border-radius: 18px !important;
      }
      
      /* Styles personnalisés pour Cal.com */
      .cal-com-embed {
        --cal-brand-color: #d4af37 !important;
        --cal-bg-primary: #0a192f !important;
        --cal-bg-secondary: #1a365d !important;
        --cal-text-primary: #f5e7a1 !important;
        --cal-text-secondary: #d4af37 !important;
        --cal-border: rgba(212,175,55,0.3) !important;
      }
    `;
    
    document.head.appendChild(style);
  }
}

// Initialiser le composant quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
  // Vérifier si nous sommes sur la page de rendez-vous
  if (window.location.pathname.includes('rendez-vous')) {
    new CalComBooking({
      calLink: 'oradia/guidance-spirituelle',
      namespace: 'oradia',
      redirectUrl: 'confirmation-rendez-vous.html'
    });
  }
});

// Exporter pour utilisation dans d'autres scripts
window.CalComBooking = CalComBooking;
