// Balise Google Ads (AW-7530868061) — un seul point de configuration pour tout
// le site, plutôt qu'un ID recopié dans chaque page. Alimente les gtag('event', ...)
// déjà appelés ailleurs (tore.html, precommande-oracle.html, livraison.html,
// success-precommande.html) et la conversion "Prise de rendez-vous" (type
// "chargement de page", configurée directement dans Google Ads sur l'URL
// confirmation-rendez-vous.html — aucun événement/libellé à envoyer depuis le code
// pour celle-ci, le simple fait que cette balise soit chargée sur cette page suffit).
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.gtag = gtag;
gtag('js', new Date());
gtag('config', 'AW-7530868061');

(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=AW-7530868061';
  document.head.appendChild(s);
})();
