(function () {
  try {
    var KEY = 'oradia_session_id';
    var sessionId = sessionStorage.getItem(KEY);
    if (!sessionId) {
      sessionId = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(KEY, sessionId);
    }
    var payload = JSON.stringify({
      path: location.pathname,
      referrer: document.referrer || '',
      session_id: sessionId
    });
    var url = '/api/admin/track';
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    }
  } catch (e) { /* tracking ne doit jamais casser la page */ }
})();
