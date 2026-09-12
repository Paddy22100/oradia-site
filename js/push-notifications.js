// Notifications push (Firebase Cloud Messaging), déclenchées à la demande depuis
// le dashboard admin — contrairement aux notifications locales (voir
// js/local-notifications.js), celles-ci nécessitent un serveur pour les envoyer,
// donc un enregistrement préalable de l'appareil (device_id + token FCM).
//
// Fonctionne uniquement dans l'app mobile native ; sur le web classique,
// window.Capacitor n'existe pas et cette fonction ne fait rien. Appelé au
// chargement de app-home.html, écran d'entrée systématique de l'app (voir
// mobile-app/capacitor.config.json).
(function () {
  const DEVICE_ID_KEY = 'oradia_device_id';

  function getPlugin() {
    return (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins)
      ? window.Capacitor.Plugins.PushNotifications
      : null;
  }

  function getOrCreateDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : ('device-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch (e) {
      return 'device-' + Date.now();
    }
  }

  function getPlatform() {
    if (window.Capacitor && window.Capacitor.getPlatform) return window.Capacitor.getPlatform();
    return 'unknown';
  }

  function registerToken(token) {
    // Pas de rattachement à un user_id ici : la forme exacte de oradia_member_session
    // (id Supabase vs autre identifiant) n'est pas garantie selon le point d'entrée de
    // connexion — un mauvais id casserait l'enregistrement (contrainte de clé étrangère).
    // Le device_id suffit pour envoyer une notification ; le rattachement pourra être
    // ajouté plus tard si un ciblage par membre devient nécessaire.
    fetch('/api/admin/notifications?action=register-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: getOrCreateDeviceId(),
        fcm_token: token,
        platform: getPlatform()
      })
    }).catch(function () {});
  }

  async function initPushNotifications() {
    try {
      const plugin = getPlugin();
      if (!plugin) return;

      const perm = await plugin.checkPermissions();
      let status = perm.receive;
      if (status !== 'granted') {
        const req = await plugin.requestPermissions();
        status = req.receive;
      }
      if (status !== 'granted') return;

      plugin.addListener('registration', function (token) {
        if (token && token.value) registerToken(token.value);
      });
      plugin.addListener('registrationError', function () {
        // Silencieux : l'appareil restera simplement non enregistré.
      });

      await plugin.register();
    } catch (e) {
      // Silencieux : ne doit jamais bloquer le chargement de l'écran d'accueil.
    }
  }

  window.oradiaPushNotifications = { init: initPushNotifications };
})();
