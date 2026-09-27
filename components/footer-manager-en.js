// Variante anglaise de footer-manager.js : ne change que templateUrl (charge
// footer-template-en.html), les chaînes du formulaire newsletter, et la source
// envoyée à /api/waitlist ('en-landing' au lieu de 'footer-newsletter', pour
// distinguer les inscriptions anglophones). Dupliqué plutôt que paramétré pour
// ne pas toucher au fichier partagé par tout le site français.
class FooterManagerEN {
  constructor() {
    this.templateUrl = '/components/footer-template-en.html';
    this.init();
  }

  async init() {
    try {
      await this.loadTemplate();
      this.injectFooter();
    } catch (error) {
      console.error('Footer initialization failed:', error);
      this.showFallback();
    }
  }

  async loadTemplate() {
    const response = await fetch(this.templateUrl);
    if (!response.ok) throw new Error('Footer template loading failed');
    this.template = await response.text();
  }

  injectFooter() {
    const placeholder = document.getElementById('footer-placeholder');
    if (placeholder) {
      placeholder.innerHTML = this.template;
      this.initNewsletterForm();
      this.initBackToTop();
      this.hideNewsletterBlockIfSubscribedMember();
    } else {
      console.error('FooterManagerEN: placeholder not found');
    }
  }

  hideNewsletterBlockIfSubscribedMember() {
    try {
      let email = null;
      const sess = sessionStorage.getItem('oradia_member_session');
      if (sess) { try { email = JSON.parse(sess).email || null; } catch (_) {} }
      if (!email && localStorage.getItem('isLoggedIn') === 'true') {
        email = localStorage.getItem('userEmail');
      }
      if (!email) return;

      fetch('/api/auth/check-newsletter?email=' + encodeURIComponent(email))
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.subscribed) {
            const section = document.getElementById('footer-newsletter-section');
            if (section) section.style.display = 'none';
          }
        })
        .catch(() => {});
    } catch (_) {}
  }

  initBackToTop() {
    if (document.getElementById('backToTop')) return;
    const hasMobileNav = !!document.querySelector('.lg\\:hidden.fixed.bottom-0');
    const btn = document.createElement('button');
    btn.id = 'backToTop';
    btn.setAttribute('aria-label', 'Back to top');
    btn.className = 'fixed right-6 w-12 h-12 bg-[rgba(5,20,40,0.9)] border border-gold/50 text-gold rounded-full shadow-lg opacity-0 transition-all duration-300 z-40 backdrop-blur-sm'
      + (hasMobileNav ? ' back-to-top--above-mobile-nav' : ' bottom-6');
    if (!document.getElementById('back-to-top-hover-style')) {
      const style = document.createElement('style');
      style.id = 'back-to-top-hover-style';
      style.textContent = '@media (hover: hover) { #backToTop:hover { background: rgba(212,175,55,0.9) !important; color: #0a1a28 !important; transform: scale(1.05); } }';
      document.head.appendChild(style);
    }
    btn.innerHTML = '<i class="fas fa-arrow-up text-sm"></i>';
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) { btn.classList.remove('opacity-0'); btn.classList.add('opacity-100'); }
      else { btn.classList.add('opacity-0'); btn.classList.remove('opacity-100'); }
    });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  initNewsletterForm() {
    const form = document.getElementById('footer-newsletter-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('footer-newsletter-email').value.trim();
      const btn = document.getElementById('footer-newsletter-btn');
      const msg = document.getElementById('footer-newsletter-msg');
      btn.disabled = true;
      btn.textContent = '...';
      try {
        const res = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'en-landing' })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          form.style.display = 'none';
          msg.textContent = '✓ Thank you! Check your inbox to confirm your subscription.';
          msg.style.color = '#d4af37';
        } else {
          msg.textContent = data.message || 'Something went wrong, please try again.';
          msg.style.color = '#f87171';
          btn.disabled = false;
          btn.textContent = 'Subscribe to the newsletter';
        }
      } catch {
        msg.textContent = 'Network error, please try again.';
        msg.style.color = '#f87171';
        btn.disabled = false;
        btn.textContent = 'Subscribe to the newsletter';
      }
      msg.classList.remove('hidden');
      msg.style.display = 'block';
    });
  }

  showFallback() {
    const placeholder = document.getElementById('footer-placeholder');
    if (placeholder) {
      placeholder.innerHTML = `
        <footer class="py-8 px-4 bg-night-blue border-t border-gold/20">
          <div class="container mx-auto max-w-6xl text-center">
            <p class="text-light-gold/70 text-sm">&copy; 2026 Oradia. All rights reserved.</p>
          </div>
        </footer>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new FooterManagerEN();
});
