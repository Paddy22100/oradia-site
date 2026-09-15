// Balises Google Ads — un seul point de configuration pour tout le site, plutôt
// qu'un ID recopié dans chaque page. Deux ID distincts existent sur ce compte
// Google Ads (constaté en le configurant directement dans l'interface, pas un
// choix arbitraire) :
// - AW-7530868061 : conversion "Prise de rendez-vous" (type "chargement de page"
//   sur confirmation-rendez-vous.html — aucun événement/libellé à envoyer depuis
//   le code pour celle-ci, le simple fait que la balise soit chargée dessus suffit).
// - AW-18010398784 : conversion "Précommande" (événement manuel, déclenché
//   explicitement depuis success-precommande.html avec le montant réel payé).
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.gtag = gtag;
gtag('js', new Date());
gtag('config', 'AW-7530868061');
gtag('config', 'AW-18010398784');

(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=AW-7530868061';
  document.head.appendChild(s);
})();
