// Modale de renonciation expresse au droit de rétractation (Code de la
// consommation, art. L221-28 12°) : pour un contenu numérique non fourni sur
// support matériel dont l'exécution commence immédiatement, la renonciation
// doit résulter d'une action distincte de l'acceptation générale des CGV —
// une case à cocher dédiée, pas seulement du texte dans les CGV.
// Utilisée avant chaque déclenchement de paiement Stripe pour l'abonnement Tore.
// Bilingue : textes anglais sur les pages en <html lang="en"> (dossier /en/).
(function () {
    var TEXTS = {
        fr: {
            defaultLabel: 'Cet abonnement',
            title: 'Avant de continuer',
            body: ' est un contenu numérique dont l\'exécution commence immédiatement après l\'activation. En cochant la case ci-dessous, vous demandez cette exécution immédiate et renoncez expressément à votre droit de rétractation de 14 jours (article L221-28 12° du Code de la consommation).',
            checkbox: 'Je demande l\'exécution immédiate et je renonce expressément à mon droit de rétractation.',
            cancel: 'Annuler',
            confirm: 'Confirmer et continuer'
        },
        en: {
            defaultLabel: 'This subscription',
            title: 'Before you continue',
            body: ' is digital content whose performance begins immediately after activation. By ticking the box below, you request this immediate performance and expressly waive your 14-day right of withdrawal (Article L221-28 12° of the French Consumer Code).',
            checkbox: 'I request immediate performance and expressly waive my right of withdrawal.',
            cancel: 'Cancel',
            confirm: 'Confirm and continue'
        }
    };

    function confirmWithdrawal(opts) {
        opts = opts || {};
        var lang = (document.documentElement.lang || 'fr').toLowerCase().indexOf('en') === 0 ? 'en' : 'fr';
        var t = TEXTS[lang];
        var label = opts.label || t.defaultLabel;

        return new Promise(function (resolve) {
            var overlay = document.createElement('div');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(4,10,20,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML =
                '<div style="background:#0a1628;border:1px solid rgba(212,175,55,0.3);border-radius:16px;max-width:440px;width:100%;padding:28px 24px;font-family:Georgia,serif;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
                    '<h3 style="color:#d4af37;font-size:1.1rem;margin:0 0 14px;">' + t.title + '</h3>' +
                    '<p style="color:rgba(229,231,235,0.85);font-size:0.85rem;line-height:1.6;margin:0 0 16px;">' +
                        label + t.body +
                    '</p>' +
                    '<label style="display:flex;align-items:flex-start;gap:10px;color:rgba(229,231,235,0.9);font-size:0.82rem;line-height:1.5;cursor:pointer;margin-bottom:20px;">' +
                        '<input type="checkbox" id="oradia-wc-checkbox" style="margin-top:3px;flex-shrink:0;width:16px;height:16px;accent-color:#d4af37;">' +
                        '<span>' + t.checkbox + '</span>' +
                    '</label>' +
                    '<div style="display:flex;gap:10px;">' +
                        '<button type="button" id="oradia-wc-cancel" style="flex:1;padding:11px;border-radius:9999px;border:1px solid rgba(212,175,55,0.3);background:transparent;color:rgba(212,175,55,0.7);font-family:inherit;font-size:0.85rem;cursor:pointer;">' + t.cancel + '</button>' +
                        '<button type="button" id="oradia-wc-confirm" disabled style="flex:1;padding:11px;border-radius:9999px;border:none;background:linear-gradient(to right,#d4af37,#f0c75e);color:#0a1628;font-weight:700;font-family:inherit;font-size:0.85rem;cursor:not-allowed;opacity:0.5;">' + t.confirm + '</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(overlay);

            var checkbox = overlay.querySelector('#oradia-wc-checkbox');
            var confirmBtn = overlay.querySelector('#oradia-wc-confirm');
            var cancelBtn = overlay.querySelector('#oradia-wc-cancel');

            checkbox.addEventListener('change', function () {
                confirmBtn.disabled = !checkbox.checked;
                confirmBtn.style.opacity = checkbox.checked ? '1' : '0.5';
                confirmBtn.style.cursor = checkbox.checked ? 'pointer' : 'not-allowed';
            });

            function cleanup(result) {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                resolve(result);
            }

            function onKey(e) {
                if (e.key === 'Escape') cleanup(false);
            }

            confirmBtn.addEventListener('click', function () { if (checkbox.checked) cleanup(true); });
            cancelBtn.addEventListener('click', function () { cleanup(false); });
            overlay.addEventListener('click', function (e) { if (e.target === overlay) cleanup(false); });
            document.addEventListener('keydown', onKey);
        });
    }

    window.OradiaWithdrawalConsent = { confirm: confirmWithdrawal };
})();
