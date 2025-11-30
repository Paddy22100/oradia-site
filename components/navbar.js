class CustomNavbar extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          z-index: 1000;
        }
        nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 2rem;
          background: rgba(5, 20, 40, 0.98);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(212, 175, 55, 0.3);
        }
        .nav-left {
          display: flex;
          align-items: center;
        }
        .logo {
          width: 4rem;
          height: 4rem;
          margin-right: 1.5rem;
        }
        .nav-center {
          display: flex;
          gap: 1.5rem;
        font-size: 1.125rem;
        font-weight: 500;
        transition: color 0.3s;
        }
        .nav-center a {
          color: #d4af37;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .nav-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .nav-link {
          color: #d4af37;
          text-decoration: none;
          transition: color 0.3s;
        }
        .nav-link:hover {
          color: #f5e7a1;
        }
        .mobile-menu-btn {
          display: none;
          background: transparent;
          border: 1px solid rgba(212, 175, 55, 0.35);
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          color: #d4af37;
          font-size: 1.125rem;
          cursor: pointer;
        }
        .mobile-menu {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: rgba(5, 20, 40, 0.98);
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(212, 175, 55, 0.3);
          padding: 1rem;
        }
        .mobile-menu.active {
          display: block;
        }
        .mobile-nav-links {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .mobile-nav-links a {
          display: block;
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          border: 1px solid rgba(212, 175, 55, 0.3);
          color: #d4af37;
          text-decoration: none;
          transition: background-color 0.3s;
        }
        .mobile-nav-links a:hover {
          background: rgba(212, 175, 55, 0.1);
        }
        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: inline-flex;
          }
          .nav-center {
            display: none;
          }
        }
      </style>
      <nav>
        <div class="nav-left">
          <img src="https://i.ibb.co/Q3vbXP4S/logo.png" alt="Oradia Logo" class="logo">
          <span class="cormorant text-3xl font-bold gold-gradient">ORADIA</span>
        </div>
        <div class="nav-center">
          <a href="index.html#accueil" class="nav-link"><i class="fas fa-home mr-2"></i>Accueil</a>
        </div>
        <div class="nav-right">
          <button id="loginBtn" class="btn-outline-gold hidden md:inline-block">Connexion</button>
        <button class="mobile-menu-btn">
          <i class="fas fa-bars"></i>
        </div>
      </nav>
    `;
    
    // Gestion du menu mobile
    const mobileMenuBtn = this.shadowRoot.querySelector('.mobile-menu-btn');
    const mobileMenu = this.shadowRoot.querySelector('.mobile-menu');
    
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
      });
    }
  }
}

customElements.define('custom-navbar', CustomNavbar);