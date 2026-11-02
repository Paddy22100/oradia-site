// CAPTCHA Cloudflare Turnstile pour les formulaires qui postent sur /api/support
// (contact FR/EN, espace membre, retours de l'app). Même principe que sur le site de
// l'herboristerie : widget invisible, qui ne s'affiche qu'en cas de doute
// (appearance "interaction-only"), en plus du champ piège "website".
//
// Activation : renseigner SITE_KEY ci-dessous (clé PUBLIQUE du widget Turnstile créé pour
// oradia.fr). Tant qu'elle est vide, ce script ne fait rien. La vérification côté serveur
// (api/support.js) ne s'active que si TURNSTILE_SECRET_KEY existe dans Vercel : poser la
// clé publique ici et déployer AVANT d'ajouter la clé secrète, sinon les formulaires
// seraient refusés.
//
// Utilisation : ajouter l'attribut data-turnstile sur le <form> ; Turnstile ajoute
// lui-même le champ "cf-turnstile-response" dans le formulaire. Après un envoi, appeler
// window.oradiaTurnstileReset(form) pour renouveler le jeton (à usage unique).
(function () {
  var SITE_KEY = '0x4AAAAAAFwwfV0hOLK3dw37';
  if (!SITE_KEY) return;

  function mount() {
    document.querySelectorAll('form[data-turnstile]').forEach(function (form) {
      if (form._turnstileId !== undefined) return;
      var box = document.createElement('div');
      box.className = 'oradia-turnstile';
      form.appendChild(box);
      form._turnstileId = window.turnstile.render(box, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        theme: 'dark'
      });
    });
  }

  window.oradiaTurnstileReset = function (form) {
    if (window.turnstile && form && form._turnstileId !== undefined) {
      window.turnstile.reset(form._turnstileId);
    }
  };

  window.__oradiaTurnstileMount = function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  };
  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__oradiaTurnstileMount';
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
})();
