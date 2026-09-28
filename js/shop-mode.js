/**
 * js/shop-mode.js — bascule du site entre précommande et vente ferme.
 *
 * Lit le mode boutique piloté depuis Dashboard > Paramètres > Fonctionnalités
 * (catégorie Boutique), exposé par GET /api/preorders/progress (clé "shop"), et
 * adapte les éléments marqués :
 *
 *   data-shop-link                       → href vers la page de vente active
 *   data-shop-text-preorder="…"          → texte si les précommandes sont la vente active
 *   data-shop-text-order="…"             → texte si la vente ferme est active
 *   data-shop-text-closed="…"            → texte si tout est fermé
 *   data-shop-hide-when="order closed"   → masqué dans les modes listés
 *   data-shop-show-if="preorder order"   → visible seulement si l'un des modes listés
 *                                          est OUVERT ("closed" = les deux fermés).
 *                                          Contrairement au mode actif, précommande et
 *                                          vente ferme peuvent être visibles ensemble
 *                                          (ex. CGV quand les deux sont ouvertes).
 *                                          Mettre style="display:none" dans le HTML sur
 *                                          les blocs invisibles par défaut.
 *
 * Mode actif : "order" si la vente ferme est ouverte, sinon "preorder" si les
 * précommandes le sont, sinon "closed". Sans réponse de l'API, rien n'est modifié
 * (le HTML d'origine correspond au mode précommande).
 *
 * API : window.OradiaShop.ready (Promise<{ mode, preorder, order, catalog }>),
 *       window.OradiaShop.apply(root) — à rappeler après une injection de HTML
 *       (header/footer chargés dynamiquement).
 */
(function () {
  if (window.OradiaShop) return;

  var CACHE_KEY = 'oradia_shop_mode_v1';
  var CACHE_MS = 60 * 1000;
  var LINKS = { order: '/commander', preorder: '/precommande-oracle.html', closed: '/precommande-oracle.html' };

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      return c && Date.now() - c.t < CACHE_MS ? c.v : null;
    } catch (e) { return null; }
  }

  function writeCache(v) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {}
  }

  function resolve(shop) {
    var preorder = shop ? shop.preorder !== false : true;
    var order = shop ? shop.order === true : false;
    return {
      mode: order ? 'order' : (preorder ? 'preorder' : 'closed'),
      preorder: preorder,
      order: order,
      catalog: shop ? shop.catalog || null : null
    };
  }

  var ready = new Promise(function (done) {
    var cached = readCache();
    if (cached) return done(cached);
    fetch('/api/preorders/progress', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.shop) return done(null);
        var state = resolve(data.shop);
        writeCache(state);
        done(state);
      })
      .catch(function () { done(null); });
  });

  function applyState(state, root) {
    if (!state) return;
    var scope = root || document;
    var mode = state.mode;

    scope.querySelectorAll('[data-shop-link]').forEach(function (el) {
      el.setAttribute('href', LINKS[mode]);
    });
    scope.querySelectorAll('[data-shop-text-' + mode + ']').forEach(function (el) {
      el.textContent = el.getAttribute('data-shop-text-' + mode);
    });
    var open = { preorder: state.preorder, order: state.order, closed: !state.preorder && !state.order };
    scope.querySelectorAll('[data-shop-show-if]').forEach(function (el) {
      var modes = (el.getAttribute('data-shop-show-if') || '').split(/\s+/);
      el.style.display = modes.some(function (m) { return open[m]; }) ? '' : 'none';
    });
    scope.querySelectorAll('[data-shop-hide-when]').forEach(function (el) {
      var modes = (el.getAttribute('data-shop-hide-when') || '').split(/\s+/);
      el.style.display = modes.indexOf(mode) !== -1 ? 'none' : '';
    });
    document.documentElement.setAttribute('data-shop-mode', mode);
  }

  window.OradiaShop = {
    ready: ready,
    apply: function (root) { return ready.then(function (s) { applyState(s, root); return s; }); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.OradiaShop.apply(); });
  } else {
    window.OradiaShop.apply();
  }
})();
