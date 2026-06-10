// js/tirages-storage.js
// Stockage de l'historique des tirages.
//
// HISTORIQUE DU PROBLÈME : l'historique était sauvegardé sous une seule clé
// globale `oradia_tirages` dans le localStorage du navigateur. Sur un appareil
// partagé entre plusieurs comptes, chacun voyait l'historique des autres.
//
// SOLUTION DÉFINITIVE : pour les membres connectés, l'historique est désormais
// stocké côté serveur dans Supabase (table `tirages`), protégé par une policy
// RLS stricte (`auth.uid() = user_id`) — chacun ne peut lire/écrire QUE ses
// propres tirages, vérifié au niveau base de données (pas seulement côté client).
//
// Pour les visiteurs non connectés (mode freemium anonyme), on garde un
// stockage local, mais namespacé "invité" et séparé de tout compte réel.

(function (global) {
  const LEGACY_KEY = 'oradia_tirages';
  const GUEST_KEY = 'oradia_tirages_invite';
  const API_BASE = '/api/tirages/send-email'; // routeur unique des actions tirages (action=save|list|send-email)

  function getSession() {
    try {
      const raw = sessionStorage.getItem('oradia_member_session') || localStorage.getItem('oradia_member_session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function getAccessToken() {
    const sess = getSession();
    return (sess && sess.access_token) ? sess.access_token : null;
  }

  function isAuthenticated() {
    return !!getAccessToken();
  }

  // Met à jour l'access_token (et refresh_token) dans les deux emplacements
  // où la session peut être stockée (sessionStorage et/ou localStorage).
  function updateStoredTokens(newSession) {
    ['sessionStorage', 'localStorage'].forEach((storageName) => {
      try {
        const storage = global[storageName];
        const raw = storage.getItem('oradia_member_session');
        if (!raw) return;
        const sess = JSON.parse(raw);
        sess.access_token = newSession.access_token;
        if (newSession.refresh_token) sess.refresh_token = newSession.refresh_token;
        storage.setItem('oradia_member_session', JSON.stringify(sess));
      } catch (e) {}
    });
  }

  // Le access_token Supabase expire après ~1h. Pour un membre connecté depuis
  // longtemps (ex. arrivé sur tore.html via "Essayer l'oracle" sans s'être
  // reconnecté), on le renouvelle via le refresh_token avant d'abandonner
  // la sauvegarde du tirage en historique "invité".
  async function refreshAccessToken() {
    const sess = getSession();
    if (!sess || !sess.refresh_token) return null;
    try {
      const resp = await fetch('/api/auth/refresh-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: sess.refresh_token })
      });
      const data = await resp.json();
      if (data && data.success && data.session) {
        updateStoredTokens(data.session);
        return data.session.access_token;
      }
    } catch (e) {}
    return null;
  }

  // ---- Stockage local (invités uniquement) ----
  function loadGuestTirages() {
    try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveGuestTirages(tirages) {
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(tirages)); } catch (e) {}
  }
  function addGuestTirage(entry, maxEntries = 20) {
    const tirages = loadGuestTirages();
    tirages.push(entry);
    if (tirages.length > maxEntries) tirages.splice(0, tirages.length - maxEntries);
    saveGuestTirages(tirages);
    return tirages;
  }

  // ---- API distante (membres connectés — Supabase + RLS) ----
  async function apiList() {
    let token = getAccessToken();
    if (!token) return [];
    try {
      let resp = await fetch(`${API_BASE}?action=list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.status === 401) {
        token = await refreshAccessToken();
        if (!token) return [];
        resp = await fetch(`${API_BASE}?action=list`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      const data = await resp.json();
      // L'API renvoie du plus récent au plus ancien ; on inverse pour rester
      // compatible avec la convention historique localStorage (ordre chronologique
      // croissant), sur laquelle reposent les `.slice(-N).reverse()` du front existant.
      if (data && data.success) return (data.tirages || []).slice().reverse();
    } catch (e) { console.warn('Tirages: échec récupération historique distant', e); }
    return [];
  }

  async function apiSave(entry) {
    let token = getAccessToken();
    if (!token) return false;
    try {
      let resp = await fetch(`${API_BASE}?action=save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(entry)
      });
      if (resp.status === 401) {
        // access_token expiré (session > 1h) : on tente un renouvellement
        // silencieux via le refresh_token avant de renoncer.
        token = await refreshAccessToken();
        if (!token) return false;
        resp = await fetch(`${API_BASE}?action=save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(entry)
        });
      }
      const data = await resp.json();
      return !!(data && data.success);
    } catch (e) {
      console.warn('Tirages: échec sauvegarde distante', e);
      return false;
    }
  }

  // ---- API publique unifiée ----
  // `loadTirages` est asynchrone : retourne l'historique distant pour un membre connecté,
  // ou l'historique local "invité" pour un visiteur non connecté.
  async function loadTirages() {
    if (isAuthenticated()) return apiList();
    return loadGuestTirages();
  }

  // `addTirage` enregistre côté Supabase si connecté (sécurisé par RLS),
  // sinon en local sous la clé "invité" (jamais sous l'ancienne clé globale partagée).
  async function addTirage(entry, maxEntries = 20) {
    if (isAuthenticated()) {
      const ok = await apiSave(entry);
      if (ok) return apiList();
      // En cas d'échec réseau, on ne perd pas le tirage : repli local "invité"
    }
    return addGuestTirage(entry, maxEntries);
  }

  // Nettoyage : supprime l'ancienne clé globale partagée (ne recopie PAS son
  // contenu vers les nouvelles clés, pour ne pas propager une fuite existante).
  function purgeLegacyGlobalHistory() {
    try {
      if (localStorage.getItem(LEGACY_KEY) !== null) {
        localStorage.removeItem(LEGACY_KEY);
      }
    } catch (e) {}
  }

  purgeLegacyGlobalHistory();

  global.OradiaTirageStorage = {
    isAuthenticated,
    loadTirages,
    addTirage,
    purgeLegacyGlobalHistory,
    // Exposés pour debug/tests uniquement
    _loadGuestTirages: loadGuestTirages,
    _getAccessToken: getAccessToken
  };
})(window);
