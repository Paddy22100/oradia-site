class HeaderManager {
  constructor() {
    this.templateUrl = '/components/header-template.html';
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
      'precommande-oracle': 'precommande-oracle',
      'livraison': 'precommande-oracle'
    };
    
    return pageMapping[page] || 'home';
  }
  
  async init() {
    try {
      await this.loadTemplate();
      this.injectHeader();
      this.setActiveState();
      this.updateMemberHeader();
      setTimeout(() => {
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
  
  updateMemberHeader() {
    var sess = sessionStorage.getItem('oradia_member_session') || localStorage.getItem('oradia_member_session');
    var isConnected = false;
    var firstName = '';

    if (sess) {
      try {
        var d = JSON.parse(sess);
        firstName = (d.name || d.email || '').split(' ')[0];
        if (firstName) isConnected = true;
      } catch(e) {}
    }

    var loginBtn    = document.getElementById('header-login-btn');
    var dropWrap    = document.getElementById('header-member-dropdown-wrap');
    var label       = document.getElementById('header-member-label');
    var loginMobile = document.getElementById('header-login-btn-mobile');
    var memberMob   = document.getElementById('header-member-mobile');
    var labelMob    = document.getElementById('header-member-label-mobile');

    if (loginBtn)    loginBtn.style.display    = isConnected ? 'none' : 'inline-flex';
    if (dropWrap)    dropWrap.style.display     = isConnected ? 'block' : 'none';
    if (label && isConnected) label.textContent = 'Bonjour\u00a0' + firstName;
    if (loginMobile) loginMobile.style.display  = isConnected ? 'none' : 'block';
    if (memberMob)   memberMob.style.display    = isConnected ? 'block' : 'none';
    if (labelMob && isConnected) labelMob.textContent = 'Bonjour\u00a0' + firstName;

    // Dropdown toggle
    var dropBtn  = document.getElementById('header-member-dropdown-btn');
    var dropMenu = document.getElementById('header-member-menu');
    if (dropBtn && dropMenu) {
      dropBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        dropMenu.style.display = dropMenu.style.display === 'block' ? 'none' : 'block';
      });
      document.addEventListener('click', function() { dropMenu.style.display = 'none'; });
    }

    // Boutons déconnexion
    var self = this;
    ['header-logout-btn', 'header-logout-btn-mobile'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function() { self.logout(); });
    });
  }

  logout() {
    ['oradia_member_session','isLoggedIn','userEmail','userName','rememberMe'].forEach(function(k) {
      sessionStorage.removeItem(k); localStorage.removeItem(k);
    });
    window.location.href = '/';
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
