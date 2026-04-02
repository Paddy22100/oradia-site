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
      console.log('FooterManager: Template injecté avec succès');
    } else {
      console.error('FooterManager: Placeholder non trouvé!');
    }
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
