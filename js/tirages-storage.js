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
    const sess = getSession();
    return !!(sess && (sess.access_token || sess.refresh_token));
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

  // Renvoie un access_token utilisable : celui déjà en session, ou sinon
  // (session avec refresh_token mais access_token absent/vidé) tente un
  // renouvellement avant de renoncer — sans ça, une session qui n'a plus
  // qu'un refresh_token valide échouerait à tort au premier essai.
  async function getValidToken() {
    const token = getAccessToken();
    if (token) return token;
    return refreshAccessToken();
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
  // global._lastApiListDebug : diagnostic temporaire (raison exacte d'une liste
  // vide — succès avec 0 résultat, 401 persistant, erreur réseau...) exposé pour
  // affichage sur member/tirages.html, à retirer une fois la cause confirmée.
  async function apiList() {
    let token = await getValidToken();
    if (!token) { global._lastApiListDebug = 'aucun token (ni access_token ni refresh_token exploitable)'; return []; }
    try {
      let resp = await fetch(`${API_BASE}?action=list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.status === 401) {
        token = await refreshAccessToken();
        if (!token) { global._lastApiListDebug = '401 puis échec du renouvellement via refresh_token'; return []; }
        resp = await fetch(`${API_BASE}?action=list`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      const data = await resp.json();
      // L'API renvoie du plus récent au plus ancien ; on inverse pour rester
      // compatible avec la convention historique localStorage (ordre chronologique
      // croissant), sur laquelle reposent les `.slice(-N).reverse()` du front existant.
      if (data && data.success) {
        const tirages = data.tirages || [];
        global._lastApiListDebug = `succès HTTP ${resp.status} — ${tirages.length} tirage(s) renvoyé(s) par le serveur`;
        return tirages.slice().reverse();
      }
      global._lastApiListDebug = `HTTP ${resp.status}, success=${data && data.success} — ${data && data.message || data && data.error || 'pas de message'}`;
    } catch (e) {
      global._lastApiListDebug = 'exception JS : ' + e.message;
      console.warn('Tirages: échec récupération historique distant', e);
    }
    return [];
  }

  // Retourne l'id du tirage enregistré (Supabase) en cas de succès, ou null sinon.
  async function apiSave(entry) {
    let token = await getValidToken();
    if (!token) return null;
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
        if (!token) return null;
        resp = await fetch(`${API_BASE}?action=save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(entry)
        });
      }
      const data = await resp.json();
      return (data && data.success && data.tirage) ? data.tirage.id : null;
    } catch (e) {
      console.warn('Tirages: échec sauvegarde distante', e);
      return null;
    }
  }

  // Complète un tirage déjà enregistré (analyse IA, synthèse, fenêtre d'observation)
  // une fois ces données disponibles sur tore-analysis.html.
  async function apiUpdate(id, fields) {
    let token = await getValidToken();
    if (!token) return false;
    const body = JSON.stringify(Object.assign({ id }, fields));
    try {
      let resp = await fetch(`${API_BASE}?action=update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body
      });
      if (resp.status === 401) {
        token = await refreshAccessToken();
        if (!token) return false;
        resp = await fetch(`${API_BASE}?action=update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body
        });
      }
      const data = await resp.json();
      return !!(data && data.success);
    } catch (e) {
      console.warn('Tirages: échec mise à jour distante', e);
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
  // Retourne { id, tirages } : `id` (id Supabase du tirage créé, pour `updateTirage`
  // une fois l'analyse IA disponible) est `null` pour les invités.
  async function addTirage(entry, maxEntries = 20) {
    if (isAuthenticated()) {
      const id = await apiSave(entry);
      if (id) return { id, tirages: await apiList() };
      // En cas d'échec réseau, on ne perd pas le tirage : repli local "invité"
    }
    return { id: null, tirages: addGuestTirage(entry, maxEntries) };
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
    updateTirage: apiUpdate,
    purgeLegacyGlobalHistory,
    // Exposés pour debug/tests uniquement
    _loadGuestTirages: loadGuestTirages,
    _getAccessToken: getAccessToken
  };
})(window);
