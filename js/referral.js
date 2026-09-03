// Programme de parrainage : "Offrez un tirage à un proche".
// Fonctionne entièrement en freemium (aucun compte requis) : chaque visiteur
// possède un code de parrainage stocké dans son navigateur. Quand un proche
// utilise son lien et complète son premier tirage, filleul ET parrain
// reçoivent chacun 1 tirage gratuit supplémentaire (voir freemium-tracker.js).
(function () {
  function genCode() {
    return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 5);
  }

  function getOrCreateCode() {
    let code = localStorage.getItem('oradia_referral_code');
    if (!code) {
      code = genCode();
      localStorage.setItem('oradia_referral_code', code);
    }
    return code;
  }

  function buildShareLink() {
    return 'https://oradia.fr/tore.html?ref=' + getOrCreateCode();
  }

  // À appeler au chargement de tore.html : mémorise le code de parrainage
  // présent dans l'URL, une seule fois (le premier lien cliqué gagne), et
  // crédite immédiatement le filleul de son tirage bonus.
  //
  // Auparavant, ce bonus n'était crédité qu'après que le filleul ait terminé
  // UN tirage (voir markConversionIfNeeded) — mais un proche ayant déjà
  // épuisé ses 2 tirages gratuits ne pouvait alors même pas commencer ce
  // premier tirage : le lien semblait "ne pas fonctionner" (cas remonté par
  // un membre en août 2026). Le bonus est donc désormais accordé dès la
  // capture du lien, pour que le filleul puisse tirer immédiatement.
  function captureReferredBy() {
    try {
      const params = new URLSearchParams(location.search);
      const ref = params.get('ref');
      if (!ref) return;
      const own = localStorage.getItem('oradia_referral_code');
      if (ref === own) return; // on ne se parraine pas soi-même
      if (!localStorage.getItem('oradia_referred_by')) {
        localStorage.setItem('oradia_referred_by', ref);
        if (window.freemiumTracker) window.freemiumTracker.addBonusDraws(1);
      }
    } catch (e) {}
  }

  // À appeler quand un tirage freemium se termine : si ce visiteur a été
  // parrainé et que la conversion n'a pas encore été enregistrée, on la
  // déclare au serveur pour que le parrain puisse réclamer son propre bonus
  // (le bonus du filleul, lui, a déjà été crédité par captureReferredBy).
  function markConversionIfNeeded() {
    try {
      const referredBy = localStorage.getItem('oradia_referred_by');
      if (!referredBy || localStorage.getItem('oradia_referral_converted')) return;
      localStorage.setItem('oradia_referral_converted', '1');
      fetch('/api/admin/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'convert', code: referredBy })
      }).catch(function () {});
    } catch (e) {}
  }

  // À appeler au chargement des pages de tirage : réclame les bonus des
  // filleuls convertis depuis la dernière visite (throttlé à 1x/6h pour
  // ne pas spammer l'API à chaque navigation).
  function claimPendingBonuses() {
    try {
      const lastCheck = parseInt(localStorage.getItem('oradia_referral_last_claim') || '0', 10);
      if (Date.now() - lastCheck < 6 * 60 * 60 * 1000) return;
      localStorage.setItem('oradia_referral_last_claim', String(Date.now()));
      const code = getOrCreateCode();
      fetch('/api/admin/referral?action=claim&code=' + encodeURIComponent(code))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.claimed > 0 && window.freemiumTracker) {
            window.freemiumTracker.addBonusDraws(data.claimed);
          }
        })
        .catch(function () {});
    } catch (e) {}
  }

  // Branche un input (readonly, pré-rempli avec le lien) + un bouton copier
  // + un bouton partager (optionnel) sur la logique de parrainage. Utilisé
  // par tore-analysis.html, la modale de fin de tirages gratuits et le
  // tableau de bord membre — une seule implémentation, jamais une copie.
  function wireShareUI(input, copyBtn, shareBtn) {
    if (!input) return;
    input.value = buildShareLink();

    function doCopy() {
      navigator.clipboard.writeText(input.value).then(function () {
        if (!copyBtn) return;
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check" style="margin-right:6px;font-size:12px;"></i>Copié';
        setTimeout(function () { copyBtn.innerHTML = orig; }, 2000);
      }).catch(function () {
        input.select();
        document.execCommand('copy');
      });
    }

    if (copyBtn) copyBtn.addEventListener('click', doCopy);

    // Sur mobile, proposer le partage natif (Messages, WhatsApp…) en plus du copier-coller.
    if (shareBtn) {
      if (navigator.share) {
        shareBtn.style.display = '';
        shareBtn.addEventListener('click', function () {
          navigator.share({
            title: 'Oradia — Tirage du Tore',
            text: 'Je t\'offre un tirage gratuit du Tore sur Oradia 🎁',
            url: input.value
          }).catch(function () {});
        });
      } else {
        shareBtn.addEventListener('click', doCopy);
      }
    }
  }

  window.oradiaReferral = {
    getOrCreateCode: getOrCreateCode,
    buildShareLink: buildShareLink,
    captureReferredBy: captureReferredBy,
    markConversionIfNeeded: markConversionIfNeeded,
    claimPendingBonuses: claimPendingBonuses,
    wireShareUI: wireShareUI
  };
})();
