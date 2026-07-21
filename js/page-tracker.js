(function () {
  try {
    // Ne pas tracker les prévisualisations Vercel
    if (location.hostname.indexOf('.vercel.app') !== -1) return;

    // Ne pas tracker les visites de l'admin (session en cours ou appareil admin connu)
    if (sessionStorage.getItem('oradia_auth')) return;
    if (localStorage.getItem('oradia_admin_device')) return;

    // Détection de navigateur automatisé / headless (Puppeteer, Playwright, Selenium…) :
    // ces marqueurs techniques ne sont presque jamais présents chez un humain.
    function isAutomated() {
      try {
        if (navigator.webdriver === true) return true;                         // drapeau standard du WebDriver
        if (/HeadlessChrome/i.test(navigator.userAgent || '')) return true;    // Chrome headless par défaut
        if (window.__nightmare || window._phantom || window.callPhantom) return true;
        if (navigator.languages && navigator.languages.length === 0) return true; // headless : langues souvent vides
      } catch (e) {}
      return false;
    }
    var automated = isAutomated();
    if (automated) return; // on ne compte pas du tout ce trafic

    var KEY = 'oradia_session_id';
    var sessionId = sessionStorage.getItem(KEY);
    if (!sessionId) {
      sessionId = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(KEY, sessionId);
    }

    // Détecter si visiteur nouveau (première visite sur cet appareil)
    var VISITOR_KEY = 'oradia_known_visitor';
    var isNew = !localStorage.getItem(VISITOR_KEY);
    if (isNew) localStorage.setItem(VISITOR_KEY, '1');

    var payload = JSON.stringify({
      path: location.pathname,
      referrer: document.referrer || '',
      session_id: sessionId,
      user_agent: navigator.userAgent || '',
      is_new_visitor: isNew
    });
    var url = '/api/admin/track';
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    }

    // Suivi du funnel de conversion (étapes nommées, sans cookie tiers) :
    // window.oradiaTrackEvent('intention_saisie' | 'tirage_lance' | 'analyse_affichee' | 'email_laisse')
    window.oradiaTrackEvent = function (eventName) {
      try {
        var evPayload = JSON.stringify({ event: eventName, session_id: sessionId, path: location.pathname });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([evPayload], { type: 'application/json' }));
        } else {
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: evPayload, keepalive: true }).catch(function () {});
        }
      } catch (e) {}
    };
  } catch (e) { /* tracking ne doit jamais casser la page */ }
})();
