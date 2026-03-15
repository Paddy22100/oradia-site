/**
 * Script client pour la gestion freemium et paiements Stripe
 * Gère l'accès aux tirages selon le niveau d'abonnement
 */

class OradiaFreemium {
  constructor() {
    this.currentUser = null;
    this.userStatus = null;
    this.apiBase = '/api';
    this.init();
  }

  async init() {
    // Vérifier si l'utilisateur est connecté
    await this.checkAuthStatus();
    
    // Initialiser les boutons de paiement
    this.initPaymentButtons();
    
    // Vérifier l'accès aux pages
    this.checkPageAccess();
    
    // Initialiser le tracking des appareils
    this.initDeviceTracking();
  }

  async checkAuthStatus() {
    const token = localStorage.getItem('oradiaToken');
    if (token) {
      try {
        const response = await fetch(`${this.apiBase}/payments/user-status`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          this.userStatus = data.data;
          this.currentUser = true;
        } else {
          localStorage.removeItem('oradiaToken');
        }
      } catch (error) {
        console.error('Erreur vérification statut:', error);
        localStorage.removeItem('oradiaToken');
      }
    }
  }

  initPaymentButtons() {
    // Bouton pour la Traversée
    const traverseeBtn = document.getElementById('orderBtn');
    if (traverseeBtn) {
      traverseeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleTraverseePayment();
      });
    }

    // Boutons directs depuis la page offres
    const buyTraverseeBtn = document.getElementById('buyTraversee');
    if (buyTraverseeBtn) {
      buyTraverseeBtn.addEventListener('click', () => {
        this.handleTraverseePayment();
      });
    }

    const subscribeToreBtn = document.getElementById('subscribeTore');
    if (subscribeToreBtn) {
      subscribeToreBtn.addEventListener('click', () => {
        this.handleToreSubscription();
      });
    }
  }

  async handleTraverseePayment() {
    if (!this.currentUser) {
      // Rediriger vers l'inscription
      this.showLoginModal('traversee');
      return;
    }

    try {
      this.showLoading('Préparation du paiement...');
      
      const token = localStorage.getItem('oradiaToken');
      const response = await fetch(`${this.apiBase}/payments/create-traversee-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        // Rediriger vers Stripe Checkout
        window.location.href = data.url;
      } else {
        this.showError(data.message || 'Erreur lors de la création de la session de paiement');
      }
    } catch (error) {
      console.error('Erreur paiement Traversée:', error);
      this.showError('Une erreur est survenue. Veuillez réessayer.');
    }
  }

  async handleToreSubscription() {
    if (!this.currentUser) {
      // Rediriger vers l'inscription
      this.showLoginModal('tore');
      return;
    }

    try {
      this.showLoading('Préparation de l\'abonnement...');
      
      const token = localStorage.getItem('oradiaToken');
      const response = await fetch(`${this.apiBase}/payments/create-tore-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        // Rediriger vers Stripe Checkout
        window.location.href = data.url;
      } else {
        this.showError(data.message || 'Erreur lors de la création de l\'abonnement');
      }
    } catch (error) {
      console.error('Erreur abonnement Tore:', error);
      this.showError('Une erreur est survenue. Veuillez réessayer.');
    }
  }

  checkPageAccess() {
    const currentPath = window.location.pathname;
    
    // Page Traversée
    if (currentPath.includes('traversee.html')) {
      if (!this.canAccessTraversee()) {
        this.showAccessDenied('traversee');
      }
    }
    
    // Page Tore
    if (currentPath.includes('tore.html')) {
      if (!this.canAccessTore()) {
        this.showAccessDenied('tore');
      }
    }
  }

  canAccessTraversee() {
    return this.userStatus && this.userStatus.credits > 0;
  }

  canAccessTore() {
    return this.userStatus && this.userStatus.subscriptionActive;
  }

  showAccessDenied(pageType) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-dark-blue rounded-2xl border border-gold/30 p-8 max-w-md w-full">
        <div class="text-center">
          <div class="w-16 h-16 mx-auto bg-gold/20 rounded-full flex items-center justify-center mb-4">
            <i class="fas fa-lock text-2xl text-gold"></i>
          </div>
          
          <h3 class="cormorant text-2xl font-bold text-gold mb-4">
            Accès Réservé
          </h3>
          
          <p class="text-light-gold mb-6">
            ${pageType === 'traversee' 
              ? 'Cette fonctionnalité nécessite des crédits de Traversée. Achetez des crédits pour continuer.'
              : 'Cette fonctionnalité nécessite un abonnement au Tore. Abonnez-vous pour débloquer l\'accès complet.'
            }
          </p>
          
          <div class="space-y-3">
            ${pageType === 'traversee' 
              ? `<button onclick="oradiaFreemium.handleTraverseePayment()" class="w-full bg-gradient-to-r from-gold to-light-gold text-night-blue font-bold py-3 px-6 rounded-full hover:shadow-lg transition-all">
                  Acheter des crédits (3€)
                </button>`
              : `<button onclick="oradiaFreemium.handleToreSubscription()" class="w-full bg-gradient-to-r from-gold to-light-gold text-night-blue font-bold py-3 px-6 rounded-full hover:shadow-lg transition-all">
                  S'abonner au Tore (8€/mois)
                </button>`
            }
            
            <button onclick="this.closest('.fixed').remove()" class="w-full border border-gold text-gold py-3 px-6 rounded-full hover:bg-gold hover:text-night-blue transition-colors">
              Plus tard
            </button>
          </div>
          
          ${!this.currentUser ? `
            <p class="text-sm text-gold/60 mt-4">
              Pas encore de compte ? 
              <a href="member/register.html" class="text-gold hover:text-light-gold underline">S'inscrire</a>
            </p>
          ` : ''}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fermer au clic sur l'arrière-plan
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        // Rediriger vers la page d'accueil
        window.location.href = 'index.html#offres';
      }
    });
  }

  showLoginModal(intent) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-dark-blue rounded-2xl border border-gold/30 p-8 max-w-md w-full">
        <div class="text-center">
          <div class="w-16 h-16 mx-auto bg-gold/20 rounded-full flex items-center justify-center mb-4">
            <i class="fas fa-user text-2xl text-gold"></i>
          </div>
          
          <h3 class="cormorant text-2xl font-bold text-gold mb-4">
            Connexion Requise
          </h3>
          
          <p class="text-light-gold mb-6">
            Connectez-vous pour accéder à ${intent === 'traversee' ? 'la Traversée' : "l'abonnement au Tore"}.
          </p>
          
          <div class="space-y-3">
            <a href="member/login.html?redirect=${encodeURIComponent(window.location.href)}" class="block w-full bg-gradient-to-r from-gold to-light-gold text-night-blue font-bold py-3 px-6 rounded-full hover:shadow-lg transition-all text-center">
              Se connecter
            </a>
            
            <a href="member/register.html?redirect=${encodeURIComponent(window.location.href)}" class="block w-full border border-gold text-gold py-3 px-6 rounded-full hover:bg-gold hover:text-night-blue transition-colors text-center">
              Créer un compte
            </a>
            
            <button onclick="this.closest('.fixed').remove()" class="w-full text-gold/60 py-2 hover:text-gold transition-colors">
              Annuler
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fermer au clic sur l'arrière-plan
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  showLoading(message) {
    this.hideLoading();
    
    const loading = document.createElement('div');
    loading.id = 'oradia-loading';
    loading.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    loading.innerHTML = `
      <div class="bg-dark-blue rounded-2xl border border-gold/30 p-8 text-center">
        <div class="w-12 h-12 mx-auto border-4 border-gold border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-light-gold">${message}</p>
      </div>
    `;
    
    document.body.appendChild(loading);
  }

  hideLoading() {
    const loading = document.getElementById('oradia-loading');
    if (loading) {
      loading.remove();
    }
  }

  showError(message) {
    this.hideLoading();
    
    const error = document.createElement('div');
    error.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-sm';
    error.innerHTML = `
      <div class="flex items-center gap-3">
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
      </div>
    `;
    
    document.body.appendChild(error);
    
    // Auto-suppression après 5 secondes
    setTimeout(() => {
      error.remove();
    }, 5000);
  }

  showSuccess(message) {
    const success = document.createElement('div');
    success.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-sm';
    success.innerHTML = `
      <div class="flex items-center gap-3">
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
      </div>
    `;
    
    document.body.appendChild(success);
    
    // Auto-suppression après 5 secondes
    setTimeout(() => {
      success.remove();
    }, 5000);
  }

  initDeviceTracking() {
    // Générer un ID d'appareil unique
    let deviceId = localStorage.getItem('oradiaDeviceId');
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      localStorage.setItem('oradiaDeviceId', deviceId);
    }
    
    // Envoyer les infos de l'appareil au serveur
    this.trackDevice();
  }

  generateDeviceId() {
    const fingerprint = this.getFingerprint();
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `device_${Math.abs(hash)}_${Date.now()}`;
  }

  getFingerprint() {
    return JSON.stringify({
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  async trackDevice() {
    try {
      await fetch(`${this.apiBase}/analytics/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'page_view',
          page: window.location.pathname,
          deviceId: localStorage.getItem('oradiaDeviceId'),
          fingerprint: this.getFingerprint()
        })
      });
    } catch (error) {
      // Ne pas bloquer si le tracking échoue
      console.log('Tracking device:', error);
    }
  }

  // Mettre à jour l'interface selon le statut utilisateur
  updateUI() {
    // Mettre à jour les compteurs de crédits
    const creditCounter = document.getElementById('creditCounter');
    if (creditCounter && this.userStatus) {
      creditCounter.textContent = `${this.userStatus.credits} crédits`;
    }

    // Mettre à jour le statut d'abonnement
    const subStatus = document.getElementById('subscriptionStatus');
    if (subStatus && this.userStatus) {
      if (this.userStatus.subscriptionActive) {
        subStatus.innerHTML = '<i class="fas fa-check-circle text-green-500"></i> Abonnement actif';
      } else {
        subStatus.innerHTML = '<i class="fas fa-times-circle text-red-500"></i> Pas d\'abonnement';
      }
    }

    // Afficher/masquer les boutons selon les accès
    const traverseeButtons = document.querySelectorAll('.traversee-access');
    const toreButtons = document.querySelectorAll('.tore-access');

    traverseeButtons.forEach(btn => {
      btn.style.display = this.canAccessTraversee() ? 'block' : 'none';
    });

    toreButtons.forEach(btn => {
      btn.style.display = this.canAccessTore() ? 'block' : 'none';
    });
  }

  // Utiliser un crédit de Traversée
  async useTraverseeCredit() {
    if (!this.canAccessTraversee()) {
      this.showAccessDenied('traversee');
      return false;
    }

    try {
      const token = localStorage.getItem('oradiaToken');
      const response = await fetch(`${this.apiBase}/payments/use-traversee-credit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        this.userStatus.credits = data.remainingCredits;
        this.updateUI();
        this.showSuccess('Crédit utilisé avec succès');
        return true;
      } else {
        this.showError(data.message || 'Erreur lors de l\'utilisation du crédit');
        return false;
      }
    } catch (error) {
      console.error('Erreur utilisation crédit:', error);
      this.showError('Une erreur est survenue');
      return false;
    }
  }
}

// Initialiser le système freemium
const oradiaFreemium = new OradiaFreemium();

// Exporter pour utilisation globale
window.OradiaFreemium = OradiaFreemium;
