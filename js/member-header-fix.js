// Espace membre : le bandeau du haut est en `position: fixed` plutôt que
// `sticky`. `html, body { overflow-x: hidden }` (responsive.css) force
// `overflow-y` à `auto` sur ces éléments d'après la spec CSS, ce qui crée un
// contexte de défilement propre au <body> et casse `position: sticky` sur
// mobile : le bandeau défilait avec la page au lieu de rester fixe.
// `position: fixed` n'est pas affecté par `overflow`, donc on compense ici
// l'espace qu'occupait le bandeau en poussant le contenu de sa hauteur réelle.
(function () {
  function adjust() {
    const header = document.querySelector('header');
    const content = document.querySelector('.flex.min-h-screen');
    if (!header || !content) return;
    content.style.paddingTop = header.offsetHeight + 'px';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', adjust);
  } else {
    adjust();
  }
  window.addEventListener('load', adjust);
  window.addEventListener('resize', adjust);

  // Recalcule aussi quand le bandeau change de taille (ex: apparition
  // différée derrière une porte de connexion, comme sur support.html).
  const header = document.querySelector('header');
  if (header && 'ResizeObserver' in window) {
    new ResizeObserver(adjust).observe(header);
  }
})();
