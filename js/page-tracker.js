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
        // user_agent requis : le endpoint /track applique le même filtre anti-bot aux
        // événements qu'aux vues de page et rejette toute requête sans user-agent valide.
        var evPayload = JSON.stringify({ event: eventName, session_id: sessionId, path: location.pathname, user_agent: navigator.userAgent || '' });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([evPayload], { type: 'application/json' }));
        } else {
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: evPayload, keepalive: true }).catch(function () {});
        }
      } catch (e) {}
    };

    // ── Capture des erreurs JS côté client (first-party, sans outil tiers) ──
    // Objectif : rendre les vrais bugs UX mesurables dans le dashboard admin
    // (table system_logs). Plafonné à 5 erreurs par session et dédupliqué pour
    // ne pas saturer la base ni le quota — une erreur en boucle ne compte qu'une fois.
    var errSent = 0;
    var errSeen = {};
    var ERR_MAX = 5;
    function reportClientError(message, sourceFile, lineno, colno) {
      try {
        if (errSent >= ERR_MAX) return;
        var msg = String(message || '').slice(0, 300);
        if (!msg) return;
        var sig = msg + '@' + (sourceFile || '') + ':' + (lineno || 0);
        if (errSeen[sig]) return; // déjà signalée dans cette session
        errSeen[sig] = true;
        errSent++;
        var errPayload = JSON.stringify({
          client_error: msg,
          error_source: String(sourceFile || '').slice(0, 300),
          error_line: lineno || null,
          error_col: colno || null,
          session_id: sessionId,
          path: location.pathname,
          user_agent: navigator.userAgent || ''
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([errPayload], { type: 'application/json' }));
        } else {
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: errPayload, keepalive: true }).catch(function () {});
        }
      } catch (e) {}
    }
    window.addEventListener('error', function (e) {
      // Ignore les erreurs de chargement de ressources (img/script) : bruit peu actionnable
      if (e && e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) return;
      reportClientError(e && e.message, e && e.filename, e && e.lineno, e && e.colno);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var reason = e && e.reason;
      var msg = reason && reason.message ? reason.message : reason;
      reportClientError('[promise] ' + msg, '', 0, 0);
    });
  } catch (e) { /* tracking ne doit jamais casser la page */ }
})();
