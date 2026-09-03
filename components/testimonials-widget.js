// components/testimonials-widget.js
// Injecte les témoignages publiés (modérés depuis le dashboard admin,
// consentement respecté via api/admin/index.js /testimonials) dans une
// grille existante. Partagé entre oracle.html et precommande-oracle.html —
// une seule logique de récupération/rendu, jamais dupliquée.
(function () {
  function renderTestimonials(gridId, options) {
    const opts = options || {};
    fetch('/api/admin/testimonials')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const list = data && data.success ? data.testimonials : [];
        if (!list || !list.length) {
          if (typeof opts.onEmpty === 'function') opts.onEmpty();
          return;
        }
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const stars = '<i class="fas fa-star text-gold text-sm"></i>'.repeat(5);
        const cardsHtml = list.map(t => `
          <div class="bg-[rgba(5,20,40,0.6)] border border-gold/20 rounded-xl p-6 hover:border-gold/40 transition-all duration-300">
            <div class="flex items-center gap-1 mb-4">${stars}</div>
            <p class="text-light-gold/90 text-sm leading-relaxed mb-4 italic">"${esc(t.message)}"</p>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
                <i class="fas fa-user text-gold text-sm"></i>
              </div>
              <div>
                <p class="text-gold font-semibold text-sm">${t.name ? esc(t.name) : 'Anonyme'}</p>
                <p class="text-light-gold/60 text-xs">Utilisateur·rice</p>
              </div>
            </div>
          </div>`).join('');
        grid.insertAdjacentHTML(opts.insertPosition || 'afterbegin', cardsHtml);
        if (typeof opts.onRendered === 'function') opts.onRendered(list.length);
      })
      .catch(() => {});
  }

  window.OradiaTestimonials = { render: renderTestimonials };
})();
