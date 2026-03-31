// CMP RGPD - Tarteaucitron Configuration
// Déployé sur toutes les pages ORADIA pour conformité RGPD

// Chargement de Tarteaucitron
(function() {
    'use strict';
    
    // Attendre que Tarteaucitron soit disponible
    function initTarteaucitron() {
        if (typeof tarteaucitron !== 'undefined') {
            console.log('Tarteaucitron trouvé, initialisation...');
            
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
            
        } else {
            console.log('Tarteaucitron pas encore chargé, nouvelle tentative dans 100ms...');
            setTimeout(initTarteaucitron, 100);
        }
    }
    
    // Démarrer l'initialisation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTarteaucitron);
    } else {
        initTarteaucitron();
    }
    
})();
