class FooterManager {
  constructor() {
    this.templateUrl = '/components/footer-template.html';
    this.init();
  }
  
  async init() {
    try {
      console.log('FooterManager: Initialisation...');
      await this.loadTemplate();
      console.log('FooterManager: Template chargé');
      this.injectFooter();
      console.log('FooterManager: Footer injecté');
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
    console.log('FooterManager: Placeholder trouvé:', placeholder);
    if (placeholder) {
      placeholder.innerHTML = this.template;
      this.initNewsletterForm();
      this.initBackToTop();
      console.log('FooterManager: Template injecté avec succès');
    } else {
      console.error('FooterManager: Placeholder non trouvé!');
    }
  }

  // Bouton « remonter en haut » — ajouté uniquement si la page n'en a pas déjà un.
  initBackToTop() {
    if (document.getElementById('backToTop')) return;
    const btn = document.createElement('button');
    btn.id = 'backToTop';
    btn.setAttribute('aria-label', 'Remonter en haut');
    btn.className = 'fixed bottom-6 right-6 w-12 h-12 bg-[rgba(5,20,40,0.9)] border border-gold/50 text-gold rounded-full shadow-lg opacity-0 transition-all duration-300 hover:bg-[rgba(212,175,55,0.9)] hover:text-night-blue hover:scale-105 z-50 backdrop-blur-sm';
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
          body: JSON.stringify({ email, source: 'footer-newsletter' })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          form.style.display = 'none';
          msg.textContent = '✓ Merci ! Vérifie ta boîte mail pour confirmer ton inscription.';
          msg.style.color = '#d4af37';
        } else {
          msg.textContent = data.message || 'Une erreur est survenue, réessaie.';
          msg.style.color = '#f87171';
          btn.disabled = false;
          btn.textContent = "S'inscrire à la newsletter";
        }
      } catch {
        msg.textContent = 'Erreur réseau, réessaie.';
        msg.style.color = '#f87171';
        btn.disabled = false;
        btn.textContent = "S'inscrire à la newsletter";
      }
      msg.classList.remove('hidden');
      msg.style.display = 'block';
    });
  }
  
  showFallback() {
    // Fallback simple : afficher un footer minimal
    const placeholder = document.getElementById('footer-placeholder');
    if (placeholder) {
      placeholder.innerHTML = `
        <footer class="py-8 px-4 bg-night-blue border-t border-gold/20">
          <div class="container mx-auto max-w-6xl text-center">
            <p class="text-light-gold/70 text-sm">&copy; 2026 Oradia. Tous droits réservés.</p>
          </div>
        </footer>
      `;
    }
  }
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
  new FooterManager();
});
