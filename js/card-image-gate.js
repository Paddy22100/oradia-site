// js/card-image-gate.js
// Révèle le visuel d'une carte (pages /cartes/*.html) uniquement aux membres
// avec un abonnement actif — la page publie le texte/SEO de la carte, mais le
// visuel du jeu physique ne doit pas être aspirable par tous (vol du deck).
// Le HTML servi initialement (donc ce que voit un crawler) ne contient aucune
// URL d'image ; elle n'est injectée dans le DOM qu'après confirmation serveur
// de l'abonnement, via /api/auth/check-subscription (même endpoint que
// tore.html / member/*.html).
(function () {
  function getSessionEmail() {
    try {
      const sessRaw = sessionStorage.getItem('oradia_member_session');
      const localRaw = localStorage.getItem('oradia_member_session');
      const sess = sessRaw ? JSON.parse(sessRaw) : null;
      const local = localRaw ? JSON.parse(localRaw) : null;
      return (sess && sess.email) || (local && local.email) || null;
    } catch (e) { return null; }
  }

  function reveal(box) {
    const src = box.getAttribute('data-image');
    const alt = box.getAttribute('data-alt') || '';
    if (!src) return;
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.onerror = function () { img.style.display = 'none'; };
    box.appendChild(img);
  }

  document.addEventListener('DOMContentLoaded', function () {
    const box = document.getElementById('card-visual');
    if (!box) return;
    const email = getSessionEmail();
    if (!email) return;
    fetch('/api/auth/check-subscription?email=' + encodeURIComponent(email))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.subscribed) reveal(box); })
      .catch(function () {});
  });
})();
