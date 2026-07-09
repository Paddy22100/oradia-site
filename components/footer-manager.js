class FooterManager {
  constructor() {
    this.templateUrl = 'components/footer-template.html';
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
      console.log('FooterManager: Template injecté avec succès');
    } else {
      console.error('FooterManager: Placeholder non trouvé!');
    }
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
