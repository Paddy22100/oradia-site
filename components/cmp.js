// CMP RGPD - Tarteaucitron Configuration
// Déployé sur toutes les pages ORADIA pour conformité RGPD

// Chargement de Tarteaucitron
(function() {
    'use strict';
    
    // Attendre que Tarteaucitron soit disponible
    function initTarteaucitron() {
        if (typeof tarteaucitron !== 'undefined') {
            console.log('Tarteaucitron trouvé, initialisation...');
            
            // Configuration Tarteaucitron - Mode popup modal
            tarteaucitron.init({
                "privacyUrl": "/politique-confidentialite.html",
                "hashtag": "#tarteaucitron",
                "cookieName": "tarteaucitron",
                "orientation": "middle",  // Centre vertical
                "showAlertSmall": false,   // Pas de petit logo flottant
                "cookieslist": true,
                "highPrivacy": true,
                "handleBrowserDNTRequest": false,
                "AcceptAllCta": true,
                "DenyAllCta": true,
                "removeCredit": true,
                "moreInfoLink": true,
                "readmoreLink": "/politique-confidentialite.html",
                "closePopup": true,         // Fermer après validation
                "showIcon": false,          // Pas d'icone flottante
                "iconPosition": "BottomRight", // Si jamais affiché
                "adblocker": false,
                "DenyAllCta": true,
                "AcceptAllCta": true,
                "moreInfoLink": true,
                "privacyUrl": "/politique-confidentialite.html",
                "internalLinks": {
                    "fr": {
                        "privacy": "/politique-confidentialite.html"
                    }
                }
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
