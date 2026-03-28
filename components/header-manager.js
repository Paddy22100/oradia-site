class HeaderManager {
  constructor() {
    this.templateUrl = 'components/header-template.html';
    this.currentPage = this.detectCurrentPage();
    this.init();
  }
  
  detectCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop().replace('.html', '') || 'home';
    
    const pageMapping = {
      '': 'home',
      'index': 'home',
      'oracle': 'oracle',
      'accompagnements': 'accompagnements',
      'rendez-vous': 'rendez-vous',
      'a-propos': 'a-propos',
      'partenariats': 'partenariats',
      'contact': 'contact',
      'pelerin': 'pelerin',
      'tore': 'tore',
      'traversee': 'traversee',
      'precommande-oracle': 'precommande-oracle'
    };
    
    return pageMapping[page] || 'home';
  }
  
  async init() {
    try {
      console.log('HeaderManager: Initialisation...');
      await this.loadTemplate();
      console.log('HeaderManager: Template chargé');
      this.injectHeader();
      console.log('HeaderManager: Header injecté');
      this.setActiveState();
      console.log('HeaderManager: État actif défini');
      // Attendre un peu que le DOM soit prêt avant d'initialiser le menu mobile
      setTimeout(() => {
        console.log('HeaderManager: Initialisation menu mobile...');
        this.initMobileMenu();
      }, 100);
    } catch (error) {
      console.error('Header initialization failed:', error);
      this.showFallback();
    }
  }
  
  async loadTemplate() {
    const response = await fetch(this.templateUrl);
    if (!response.ok) throw new Error('Template loading failed');
    this.template = await response.text();
  }
  
  injectHeader() {
    const placeholder = document.getElementById('header-placeholder');
    console.log('HeaderManager: Placeholder trouvé:', placeholder);
    if (placeholder) {
      placeholder.innerHTML = this.template;
      console.log('HeaderManager: Template injecté avec succès');
    } else {
      console.error('HeaderManager: Placeholder non trouvé!');
    }
  }
  
  setActiveState() {
    // Retirer tous les états actifs
    document.querySelectorAll('[data-page]').forEach(link => {
      link.classList.remove('text-light-gold');
    });
    
    // Ajouter état actif sur la page courante
    const activeLinks = document.querySelectorAll(`[data-page="${this.currentPage}"]`);
    activeLinks.forEach(link => {
      link.classList.add('text-light-gold');
    });
  }
  
  initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    
    console.log('HeaderManager: mobileMenuBtn =', mobileMenuBtn);
    console.log('HeaderManager: mobileMenu =', mobileMenu);
    
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('HeaderManager: Click sur menu burger');
        mobileMenu.classList.toggle('hidden');
        const isHidden = mobileMenu.classList.contains('hidden');
        mobileMenuBtn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
        console.log('HeaderManager: Menu basculé, hidden =', isHidden);
      });
      
      // Fermer le menu en cliquant à l'extérieur
      document.addEventListener('click', (e) => {
        if (!mobileMenuBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
          mobileMenu.classList.add('hidden');
          mobileMenuBtn.setAttribute('aria-expanded', 'false');
        }
      });
    } else {
      console.error('HeaderManager: Éléments du menu mobile non trouvés');
    }
  }
  
  showFallback() {
    // Fallback simple : afficher un header minimal
    const placeholder = document.getElementById('header-placeholder');
    if (placeholder) {
      placeholder.innerHTML = `
        <header class="header-bg w-full py-2 sm:py-3 px-4 md:py-4 md:px-8">
          <div class="max-w-7xl mx-auto">
            <div class="flex items-center justify-between">
              <a href="/" class="flex items-center">
                <img src="images/logo-hd-v2.jpeg" alt="Oradia Logo" class="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16">
                <span class="cormorant text-2xl sm:text-3xl font-bold gold-gradient ml-3">ORADIA</span>
              </a>
            </div>
          </div>
        </header>
      `;
    }
  }
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
  new HeaderManager();
});
