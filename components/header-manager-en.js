// Variante anglaise de header-manager.js : ne change que templateUrl (charge
// header-template-en.html) et les quelques chaînes visibles côté membre.
// Toute la logique (menu mobile, état actif, session) reste identique — dupliquée
// ici plutôt que paramétrée pour ne pas toucher au fichier partagé par tout le
// site français.
class HeaderManagerEN {
  constructor() {
    this.templateUrl = '/components/header-template-en.html';
    this.currentPage = this.detectCurrentPage();
    this.init();
  }

  detectCurrentPage() {
    const path = window.location.pathname;
    if (path === '/en/' || path === '/en/index.html' || path === '/en') return 'home';
    return 'home';
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
    if (placeholder) {
      placeholder.innerHTML = this.template;
    } else {
      console.error('HeaderManagerEN: placeholder not found');
    }
  }

  setActiveState() {
    document.querySelectorAll('[data-page]').forEach(link => {
      link.classList.remove('text-light-gold');
    });
    const activeLinks = document.querySelectorAll(`[data-page="${this.currentPage}"]`);
    activeLinks.forEach(link => {
      link.classList.add('text-light-gold');
    });
  }

  initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mobileMenu.classList.toggle('hidden');
        const isHidden = mobileMenu.classList.contains('hidden');
        mobileMenuBtn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
      });
      document.addEventListener('click', (e) => {
        if (!mobileMenuBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
          mobileMenu.classList.add('hidden');
          mobileMenuBtn.setAttribute('aria-expanded', 'false');
        }
      });
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
      } catch (e) {}
    }

    var loginBtn    = document.getElementById('header-login-btn');
    var dropWrap    = document.getElementById('header-member-dropdown-wrap');
    var label       = document.getElementById('header-member-label');
    var loginMobile = document.getElementById('header-login-btn-mobile');
    var memberMob   = document.getElementById('header-member-mobile');
    var labelMob    = document.getElementById('header-member-label-mobile');

    if (loginBtn)    loginBtn.style.display    = isConnected ? 'none' : 'inline-flex';
    if (dropWrap)    dropWrap.style.display     = isConnected ? 'block' : 'none';
    if (label && isConnected) label.textContent = 'Hi ' + firstName;
    if (loginMobile) loginMobile.style.display  = isConnected ? 'none' : 'block';
    if (memberMob)   memberMob.style.display    = isConnected ? 'block' : 'none';
    if (labelMob && isConnected) labelMob.textContent = 'Hi ' + firstName;

    var dropBtn  = document.getElementById('header-member-dropdown-btn');
    var dropMenu = document.getElementById('header-member-menu');
    if (dropBtn && dropMenu) {
      dropBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        dropMenu.style.display = dropMenu.style.display === 'block' ? 'none' : 'block';
      });
      document.addEventListener('click', function() { dropMenu.style.display = 'none'; });
    }

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
    window.location.href = '/en/';
  }

  showFallback() {
    const placeholder = document.getElementById('header-placeholder');
    if (placeholder) {
      placeholder.innerHTML = `
        <header class="header-bg w-full py-2 sm:py-3 px-4 md:py-4 md:px-8">
          <div class="max-w-7xl mx-auto">
            <div class="flex items-center justify-between">
              <a href="/en/" class="flex items-center">
                <img src="/images/logo-hd-v2.webp" alt="Oradia Logo" class="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16">
                <span class="cormorant text-2xl sm:text-3xl font-bold gold-gradient ml-3">ORADIA</span>
              </a>
            </div>
          </div>
        </header>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HeaderManagerEN();
});
