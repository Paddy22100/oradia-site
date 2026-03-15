/**
 * Script de nettoyage pour la production
 * Supprime les console.log, console.error, debugger en production
 */

// Détecter si nous sommes en production
const isProduction = () => {
  return window.location.hostname !== 'localhost' && 
         window.location.hostname !== '127.0.0.1' &&
         !window.location.hostname.includes('dev') &&
         !window.location.protocol.includes('file');
};

// Remplacer les méthodes de console en production
if (isProduction()) {
  // Désactiver toutes les méthodes de console sauf error et warn
  const originalConsole = window.console;
  window.console = {
    ...originalConsole,
    log: () => {},
    info: () => {},
    debug: () => {},
    trace: () => {},
    group: () => {},
    groupEnd: () => {},
    groupCollapsed: () => {},
    clear: () => {},
    count: () => {},
    countReset: () => {},
    table: () => {},
    dir: () => {},
    dirxml: () => {},
    assert: () => {},
    profile: () => {},
    profileEnd: () => {},
    time: () => {},
    timeEnd: () => {},
    timeLog: () => {},
    timeStamp: () => {},
    
    // Garder error et warn pour le débogage en production si nécessaire
    error: originalConsole.error,
    warn: originalConsole.warn
  };

  // Désactiver le debugger
  window.debugger = undefined;
  
  // Surveiller les erreurs critiques et les envoyer à un service de monitoring si disponible
  window.addEventListener('error', (event) => {
    // Envoyer les erreurs à un service de monitoring (optionnel)
    if (window.analyticsService) {
      window.analyticsService.trackError({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    }
  });

  // Surveiller les rejets de promesses non gérés
  window.addEventListener('unhandledrejection', (event) => {
    if (window.analyticsService) {
      window.analyticsService.trackError({
        type: 'unhandledrejection',
        reason: event.reason,
        stack: event.reason?.stack
      });
    }
  });
}

// Fonction pour nettoyer dynamiquement les scripts chargés
const cleanupScripts = () => {
  if (!isProduction()) return;
  
  // Nettoyer les variables globales sensibles
  const sensitiveVars = [
    'password', 'token', 'secret', 'key', 'api', 'private',
    'credentials', 'auth', 'session', 'cookie'
  ];
  
  // Supprimer les données sensibles du localStorage et sessionStorage
  const cleanStorage = (storage) => {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && sensitiveVars.some(sensitive => key.toLowerCase().includes(sensitive))) {
        storage.removeItem(key);
      }
    }
  };
  
  cleanStorage(localStorage);
  cleanStorage(sessionStorage);
};

// Fonction pour sécuriser l'affichage des données
const safeDisplay = (data) => {
  if (typeof data === 'string') {
    return data
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
  return data;
};

// Fonction pour valider les URLs avant navigation
const safeNavigate = (url) => {
  try {
    const parsedUrl = new URL(url, window.location.origin);
    
    // Autoriser seulement les URLs du même domaine ou domaines de confiance
    const allowedDomains = [
      window.location.hostname,
      'oradia.vercel.app',
      'www.oradia.fr',
      'oradia.fr',
      'stripe.com',
      'js.stripe.com'
    ];
    
    if (!allowedDomains.includes(parsedUrl.hostname)) {
      console.warn('Navigation bloquée vers domaine non autorisé:', parsedUrl.hostname);
      return false;
    }
    
    // Bloquer les protocoles dangereux
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    if (dangerousProtocols.some(protocol => url.toLowerCase().startsWith(protocol))) {
      console.warn('Navigation bloquée: protocole dangereux détecté');
      return false;
    }
    
    return true;
  } catch (error) {
    console.warn('URL invalide:', url);
    return false;
  }
};

// Surveiller les tentatives de navigation
document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (link && link.href) {
    if (!safeNavigate(link.href)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
});

// Nettoyer au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  cleanupScripts();
  
  // Ajouter des meta tags de sécurité supplémentaires
  if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    const cspMeta = document.createElement('meta');
    cspMeta.httpEquiv = 'Content-Security-Policy';
    cspMeta.content = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://fonts.googleapis.com; frame-src 'self' https://js.stripe.com; object-src 'none';";
    document.head.appendChild(cspMeta);
  }
});

// Exporter les fonctions utiles
window.ProductionSecurity = {
  isProduction,
  safeDisplay,
  safeNavigate,
  cleanupScripts
};
