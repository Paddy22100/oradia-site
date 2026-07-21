// Formulaire d'inscription newsletter inline, conforme RGPD (case de consentement
// décochée par défaut — opt-in explicite, pas de pré-cochage).
// Usage : <div data-oradia-newsletter data-title="..." data-text="..."></div>
// puis <script src="/js/newsletter-inline.js" defer></script>
(function () {
  function render(container) {
    const title = container.dataset.title || 'Recevoir la lettre Oradia';
    const text = container.dataset.text || 'Un message occasionnel pour nourrir votre chemin intérieur. Désinscription en un clic, à tout moment.';
    const uid = 'nl-inline-' + Math.random().toString(36).slice(2, 9);

    container.innerHTML = `
      <div style="max-width:420px;margin:0 auto;padding:28px 24px;background:rgba(5,20,40,0.55);border:1px solid rgba(212,175,55,0.25);border-radius:16px;text-align:center;">
        <p style="margin:0 0 8px;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;">${title}</p>
        <p style="margin:0 0 18px;color:rgba(212,175,55,0.65);font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;line-height:1.6;">${text}</p>
        <form id="${uid}-form" style="display:flex;flex-direction:column;gap:10px;text-align:left;">
          <input type="email" id="${uid}-email" required placeholder="Votre adresse email" aria-label="Votre adresse email"
            style="background:rgba(5,20,40,0.7);border:1px solid rgba(212,175,55,0.3);border-radius:10px;color:#e8d9b0;font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;padding:12px 16px;outline:none;width:100%;box-sizing:border-box;">
          <button type="submit"
            style="background:linear-gradient(135deg,#d4af37,#f0c75e);color:#051428;font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;font-weight:700;padding:12px 18px;border:none;border-radius:10px;cursor:pointer;letter-spacing:0.5px;margin-top:4px;">
            S'inscrire
          </button>
          <p style="margin:10px 0 0;color:rgba(212,175,55,0.5);font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;line-height:1.5;">En vous inscrivant, vous acceptez de recevoir la newsletter Oradia. Désinscription à tout moment. <a href="/politique-confidentialite.html" style="color:rgba(212,175,55,0.75);text-decoration:underline;">Politique de confidentialité</a>.</p>
        </form>
        <p id="${uid}-msg" style="display:none;margin:14px 0 0;color:#d4af37;font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;"></p>
      </div>`;

    const form = document.getElementById(uid + '-form');
    const msg = document.getElementById(uid + '-msg');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = document.getElementById(uid + '-email').value.trim();
      if (!email) return;
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Inscription…';
      try {
        const res = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: container.dataset.source || 'inline' })
        });
        if (res.ok) {
          form.style.display = 'none';
          msg.textContent = '✦ Merci ✦ Vous recevrez bientôt votre première lettre.';
          msg.style.display = 'block';
        } else {
          btn.disabled = false;
          btn.textContent = "S'inscrire";
          msg.textContent = "Une erreur est survenue, réessayez dans un instant.";
          msg.style.color = '#e08080';
          msg.style.display = 'block';
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "S'inscrire";
      }
    });
  }

  function init() {
    document.querySelectorAll('[data-oradia-newsletter]').forEach(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
