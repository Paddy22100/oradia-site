(function () {
  try {
    // Ne pas tracker les prévisualisations Vercel
    if (location.hostname.indexOf('.vercel.app') !== -1) return;

    // Ne pas tracker les visites de l'admin (session en cours ou appareil admin connu)
    if (sessionStorage.getItem('oradia_auth')) return;
    if (localStorage.getItem('oradia_admin_device')) return;

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
  } catch (e) { /* tracking ne doit jamais casser la page */ }
})();
