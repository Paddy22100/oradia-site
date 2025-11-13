class CGUModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          z-index: 1000;
          align-items: center;
          justify-content: center;
        }
        .modal-content {
          background: #0a192f;
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 12px;
          padding: 2rem;
          max-width: 800px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          color: #f5e7a1;
          position: relative;
        }
        .close-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: transparent;
          border: none;
          color: #d4af37;
          font-size: 1.5rem;
          cursor: pointer;
        }
        h2 {
          color: #d4af37;
          font-family: 'Cormorant Garamond', serif;
          margin-top: 0;
        }
      </style>
      <div class="modal-content">
        <button class="close-btn">&times;</button>
        <h2>Conditions Générales d'Utilisation</h2>
        <div class="cgu-content">
          <h3>1. Acceptation des CGU</h3>
          <p>L'utilisation du site Oradia implique l'acceptation pleine et entière des présentes conditions générales d'utilisation.</p>
          
          <h3>2. Description des services</h3>
          <p>Oradia est un oracle vibratoire proposant des tirages de cartes à titre informatif et de développement personnel.</p>
          
          <h3>3. Responsabilité</h3>
          <p>Les tirages proposés ne constituent en aucun cas une consultation médicale, psychologique ou financière.</p>
          
          <h3>4. Propriété intellectuelle</h3>
          <p>Tous les éléments du site (textes, images, logos) sont la propriété exclusive d'Oradia.</p>
          
          <h3>5. Données personnelles</h3>
          <p>Les données collectées sont traitées conformément à notre politique de confidentialité.</p>
          
          <h3>6. Paiements et remboursements</h3>
          <p>Les paiements sont sécurisés. Les abonnements mensuels peuvent être résiliés à tout moment.</p>
          
          <h3>7. Modifications</h3>
          <p>Oradia se réserve le droit de modifier ces CGU à tout moment.</p>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    this.shadowRoot.querySelector('.close-btn').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  open() {
    this.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.style.display = 'none';
    document.body.style.overflow = '';
  }
}

customElements.define('cgu-modal', CGUModal);