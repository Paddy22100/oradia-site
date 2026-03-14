// Navigation unifiée pour toutes les pages Oradia
document.addEventListener('DOMContentLoaded', function() {
  // Menu mobile
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }
  
  // Menu membre
  const memberMenuBtn = document.getElementById('memberMenuBtn');
  const memberDropdown = document.getElementById('memberDropdown');
  
  if (memberMenuBtn && memberDropdown) {
    memberMenuBtn.addEventListener('click', () => {
      memberDropdown.classList.toggle('hidden');
    });
  }
  
  // Fermer les menus en cliquant ailleurs
  document.addEventListener('click', (e) => {
    if (mobileMenuBtn && mobileMenu && !mobileMenuBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.add('hidden');
    }
    
    if (memberMenuBtn && memberDropdown && !memberMenuBtn.contains(e.target) && !memberDropdown.contains(e.target)) {
      memberDropdown.classList.add('hidden');
    }
  });
  
  // Scroll to top button
  const scrollTopBtn = document.getElementById('scrollTop');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.pageYOffset > 300) {
        scrollTopBtn.classList.add('show');
      } else {
        scrollTopBtn.classList.remove('show');
      }
    });
    
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
  
  // Gestion de l'état de connexion (simulation)
  updateCtasForAuth();
});

// Fonction pour mettre à jour les CTA selon l'état de connexion
function updateCtasForAuth() {
  const isLoggedIn = localStorage.getItem('oradia_user_token') !== null;
  const loginBtnMobile = document.getElementById('loginBtnMobile');
  const memberMenuWrapper = document.getElementById('memberMenuWrapper');
  
  if (isLoggedIn) {
    // Utilisateur connecté
    if (loginBtnMobile) {
      loginBtnMobile.style.display = 'none';
    }
    if (memberMenuWrapper) {
      memberMenuWrapper.classList.remove('hidden');
    }
  } else {
    // Utilisateur non connecté
    if (loginBtnMobile) {
      loginBtnMobile.style.display = 'block';
    }
    if (memberMenuWrapper) {
      memberMenuWrapper.classList.add('hidden');
    }
  }
}

// Fonction de déconnexion
function logout() {
  localStorage.removeItem('oradia_user_token');
  localStorage.removeItem('oradia_user_data');
  window.location.href = 'index.html';
}

// Attacher la fonction de déconnexion au bouton si présent
document.addEventListener('DOMContentLoaded', function() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});
