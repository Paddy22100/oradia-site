// Appels à l'API membre avec le jeton de la personne connectée.
// oradiaCheckSubscription(email) : renvoie une Response comme fetch(). Le serveur ne donne le détail
// d'un abonnement qu'à la personne connectée concernée ; le jeton est renouvelé s'il a expiré.
(function () {
  var KEY = 'oradia_member_session';
  function lire() {
    var raw = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function ecrire(sess) {
    var s = JSON.stringify(sess);
    if (sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, s);
    if (localStorage.getItem(KEY)) localStorage.setItem(KEY, s);
  }
  window.oradiaCheckSubscription = async function (email) {
    var sess = lire();
    var url = '/api/auth/check-subscription?email=' + encodeURIComponent(email || (sess && sess.email) || '');
    if (!sess || !sess.access_token) return fetch(url);
    var res = await fetch(url, { headers: { Authorization: 'Bearer ' + sess.access_token } });
    if (res.status === 401 && sess.refresh_token) {
      try {
        var r = await fetch('/api/auth/refresh-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sess.refresh_token }) });
        var d = await r.json();
        if (d.success && d.session) {
          sess.access_token = d.session.access_token; sess.refresh_token = d.session.refresh_token; ecrire(sess);
          res = await fetch(url, { headers: { Authorization: 'Bearer ' + sess.access_token } });
        }
      } catch (e) { /* on retombe sur la réponse réduite */ }
    }
    if (res.status === 401) return fetch(url); // jeton inutilisable : réponse réduite (abonné ou non)
    return res;
  };
})();
