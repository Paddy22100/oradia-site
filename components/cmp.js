// CMP RGPD - Tarteaucitron Configuration
// Déployé sur toutes les pages ORADIA pour conformité RGPD

// Chargement de Tarteaucitron
(function() {
    'use strict';
    
    // Vérifier si Tarteaucitron est déjà chargé
    if (typeof tarteaucitron === 'undefined') {
        console.error('Tarteaucitron non chargé');
        return;
    }
    
    // Configuration Tarteaucitron
    tarteaucitron.init({
        "privacyUrl": "/politique-confidentialite.html",
        "hashtag": "#tarteaucitron",
        "cookieName": "tarteaucitron",
        "orientation": "bottom",
        "showAlertSmall": false,
        "cookieslist": true,
        "highPrivacy": true,
        "handleBrowserDNTRequest": false,
        "AcceptAllCta": true,
        "DenyAllCta": true,
        "removeCredit": true,
        "moreInfoLink": true,
        "readmoreLink": "/politique-confidentialite.html"
    });
    
    // Services externes (désactivés - non déployés)
    // tarteaucitron.user.googletagmanager = false;
    // tarteaucitron.user.googleanalytics = false;
    // tarteaucitron.user.facebookpixel = false;
    
})();
