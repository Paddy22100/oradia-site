// lib/shop-mode.js
// Mode de vente de l'oracle physique, piloté depuis Dashboard > Paramètres >
// Fonctionnalités (catégorie Boutique) :
//   - shop_preorder_enabled : précommandes ouvertes (page /precommande)
//   - shop_order_enabled    : vente ferme ouverte (page /commander)
//
// Valeurs par défaut EXPLICITES (et non le fail-open générique d'isFeatureEnabled) :
// si la table est inaccessible ou une clé absente, on garde l'état historique du
// site — précommandes ouvertes, vente ferme fermée — pour ne jamais ouvrir la vente
// ferme avant l'arrivée du stock à cause d'une panne Supabase.

const SHOP_FLAG_DEFAULTS = {
  shop_preorder_enabled: true,
  shop_order_enabled: false
};

async function getShopMode(supabase) {
  const mode = { preorder: SHOP_FLAG_DEFAULTS.shop_preorder_enabled, order: SHOP_FLAG_DEFAULTS.shop_order_enabled };
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, enabled')
      .in('key', Object.keys(SHOP_FLAG_DEFAULTS));
    if (error || !Array.isArray(data)) return mode;
    for (const row of data) {
      if (row.key === 'shop_preorder_enabled') mode.preorder = row.enabled === true;
      if (row.key === 'shop_order_enabled') mode.order = row.enabled === true;
    }
  } catch (e) {
    console.warn('[shop-mode] lecture impossible, valeurs par défaut:', e.message);
  }
  return mode;
}

// Quantités vendues par offre (précommandes + commandes payées), pour le stock
// limité (Édition Signature). rows = lignes preorders { items, offer }.
function countSoldByOffer(rows) {
  const sold = {};
  for (const row of rows || []) {
    const items = Array.isArray(row.items) && row.items.length ? row.items : [{ offer: row.offer, quantity: 1 }];
    for (const it of items) {
      if (!it || !it.offer) continue;
      const q = Number(it.quantity);
      sold[it.offer] = (sold[it.offer] || 0) + (Number.isFinite(q) && q > 0 ? q : 1);
    }
  }
  return sold;
}

module.exports = { SHOP_FLAG_DEFAULTS, getShopMode, countSoldByOffer };
