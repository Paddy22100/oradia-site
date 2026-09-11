// Notifications locales programmées sur l'appareil (via le plugin Capacitor
// LocalNotifications). Fonctionne uniquement dans l'app mobile Oradia — sur le
// web classique, window.Capacitor n'existe pas et ces fonctions ne font rien.
//
// Contrairement à une notification push, celle-ci est programmée à l'avance sur
// le téléphone au moment de l'appel : aucun serveur n'a besoin de "déclencher"
// l'envoi le jour J, ce qui évite d'avoir à mettre en place Firebase/APNs pour
// ce cas d'usage (la date de déclenchement est connue dès la création).
(function () {
  function getPlugin() {
    return (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins)
      ? window.Capacitor.Plugins.LocalNotifications
      : null;
  }

  // Id numérique stable et suffisamment unique pour une notification (les ids
  // Capacitor doivent être des entiers 32 bits) — dérivé de l'horodatage courant.
  function makeNotificationId() {
    return Date.now() % 2147483647;
  }

  // Programme le rappel de fin de fenêtre d'observation. À appeler juste après
  // l'activation réussie côté serveur (POST /api/fenetre/activation), avec la
  // date de clôture qu'il a renvoyée.
  //
  // closesAt : string ISO (renvoyée par l'API, ex. data.closesAt)
  // intention : texte de l'intention posée par l'utilisateur (peut être vide)
  async function scheduleObservationClosing(closesAt, intention) {
    try {
      const plugin = getPlugin();
      if (!plugin || !closesAt) return;

      const at = new Date(closesAt);
      if (isNaN(at.getTime()) || at.getTime() <= Date.now()) return;

      const perm = await plugin.checkPermissions();
      if (perm.display !== 'granted') {
        const req = await plugin.requestPermissions();
        if (req.display !== 'granted') return;
      }

      const body = intention
        ? `Qu'as-tu remarqué autour de « ${intention.slice(0, 120)} » ?`
        : "Qu'as-tu remarqué durant cette période ?";

      await plugin.schedule({
        notifications: [{
          id: makeNotificationId(),
          title: 'Ta fenêtre d’observation se referme',
          body: body,
          schedule: { at: at },
          extra: { type: 'observation-window-closing' }
        }]
      });
    } catch (e) {
      // Silencieux : l'email de clôture existant reste le filet de sécurité.
    }
  }

  window.oradiaNotifications = {
    scheduleObservationClosing: scheduleObservationClosing
  };
})();
