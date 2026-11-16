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
            confirm: 'Confirmer et continuer',
            price: 'Offre de lancement : 5 €/mois le premier mois, puis 8 €/mois, sans engagement, résiliable à tout moment depuis votre espace membre.',
            priceTrial: 'Essai gratuit de 30 jours, puis 8 €/mois, sans engagement, résiliable à tout moment depuis votre espace membre.',
            guidanceTitle: 'Avant de réserver votre guidance',
            guidanceBody: 'Merci de confirmer les deux points suivants pour accéder au calendrier de réservation.',
            guidanceCgv: 'J\'ai lu et j\'accepte les <a href="/cgv.html" target="_blank" rel="noopener" style="color:#d4af37;text-decoration:underline;">Conditions Générales de Vente</a>.',
            guidanceWaiver: 'Je demande l\'exécution de la séance avant la fin du délai de rétractation de 14 jours. Je reconnais qu\'une fois la séance pleinement exécutée, je perds mon droit de rétractation (art. L221-28 1° du Code de la consommation).'
        },
        en: {
            defaultLabel: 'This subscription',
            title: 'Before you continue',
            body: ' is digital content whose performance begins immediately after activation. By ticking the box below, you request this immediate performance and expressly waive your 14-day right of withdrawal (Article L221-28 12° of the French Consumer Code).',
            checkbox: 'I request immediate performance and expressly waive my right of withdrawal.',
            cancel: 'Cancel',
            confirm: 'Confirm and continue',
            price: 'Launch offer: €5 for the first month, then €8/month, no commitment, cancellable at any time from your member area.',
            priceTrial: '30-day free trial, then €8/month, no commitment, cancellable at any time from your member area.',
            guidanceTitle: 'Before booking your guidance session',
            guidanceBody: 'Please confirm both points below to access the booking calendar.',
            guidanceCgv: 'I have read and accept the <a href="/en/cgv.html" target="_blank" rel="noopener" style="color:#d4af37;text-decoration:underline;">Terms and Conditions of Sale</a>.',
            guidanceWaiver: 'I request that the session take place before the end of the 14-day withdrawal period. I acknowledge that once the session has been fully performed, I lose my right of withdrawal (Article L221-28 1° of the French Consumer Code).'
        }
    };

    function confirmWithdrawal(opts) {
        opts = opts || {};
        var lang = (document.documentElement.lang || 'fr').toLowerCase().indexOf('en') === 0 ? 'en' : 'fr';
        var t = TEXTS[lang];
        var label = opts.label || t.defaultLabel;

        return new Promise(function (resolve) {
            var isGuidance = opts.kind === 'guidance';
            var overlay = document.createElement('div');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(4,10,20,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML =
                '<div style="background:#0a1628;border:1px solid rgba(212,175,55,0.3);border-radius:16px;max-width:440px;width:100%;padding:28px 24px;font-family:Georgia,serif;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
                    '<h3 style="color:#d4af37;font-size:1.1rem;margin:0 0 14px;">' + (isGuidance ? t.guidanceTitle : t.title) + '</h3>' +
                    '<p style="color:rgba(229,231,235,0.85);font-size:0.85rem;line-height:1.6;margin:0 0 16px;">' +
                        (isGuidance ? t.guidanceBody : label + t.body + ' <strong>' + (opts.trial ? t.priceTrial : t.price) + '</strong>') +
                    '</p>' +
                    (isGuidance
                        ? '<label style="display:flex;align-items:flex-start;gap:10px;color:rgba(229,231,235,0.9);font-size:0.82rem;line-height:1.5;cursor:pointer;margin-bottom:12px;">' +
                              '<input type="checkbox" id="oradia-wc-checkbox2" style="margin-top:3px;flex-shrink:0;width:16px;height:16px;accent-color:#d4af37;">' +
                              '<span>' + t.guidanceCgv + '</span>' +
                          '</label>'
                        : '') +
                    '<label style="display:flex;align-items:flex-start;gap:10px;color:rgba(229,231,235,0.9);font-size:0.82rem;line-height:1.5;cursor:pointer;margin-bottom:20px;">' +
                        '<input type="checkbox" id="oradia-wc-checkbox" style="margin-top:3px;flex-shrink:0;width:16px;height:16px;accent-color:#d4af37;">' +
                        '<span>' + (isGuidance ? t.guidanceWaiver : t.checkbox) + '</span>' +
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

            var checkbox2 = overlay.querySelector('#oradia-wc-checkbox2');
            function allChecked() { return checkbox.checked && (!checkbox2 || checkbox2.checked); }
            function refresh() {
                var ok = allChecked();
                confirmBtn.disabled = !ok;
                confirmBtn.style.opacity = ok ? '1' : '0.5';
                confirmBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
            }
            checkbox.addEventListener('change', refresh);
            if (checkbox2) checkbox2.addEventListener('change', refresh);

            function cleanup(result) {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                resolve(result);
            }

            function onKey(e) {
                if (e.key === 'Escape') cleanup(false);
            }

            confirmBtn.addEventListener('click', function () { if (allChecked()) cleanup(true); });
            cancelBtn.addEventListener('click', function () { cleanup(false); });
            overlay.addEventListener('click', function (e) { if (e.target === overlay) cleanup(false); });
            document.addEventListener('keydown', onKey);
        });
    }

    // Trace de l'acceptation (horodatage, e-mail, version des CGV) dans Supabase, via
    // la route existante /api/create-checkout-session (limite de 12 fonctions Vercel).
    // N'échoue jamais bruyamment : la trace ne doit pas bloquer le parcours.
    function logConsent(kind, email, extra) {
        try {
            return fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify({ type: 'legal-consent', kind: kind, email: email || '', extra: extra || {} })
            }).catch(function () {});
        } catch (_) { return Promise.resolve(); }
    }

    window.OradiaWithdrawalConsent = { confirm: confirmWithdrawal, log: logConsent };
})();
