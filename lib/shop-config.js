// lib/shop-config.js
// Source unique de la boutique de l'oracle physique : offres, prix (précommande et
// vente ferme), stock, poids, frais de port. Lue par api/create-checkout-session.js
// (calcul serveur, seul faisant foi) et exposée au navigateur via
// GET /api/preorders/progress (clé "shop.catalog") pour l'affichage.
//
// Pour changer un prix : modifier priceCents ci-dessous, rien d'autre. Avec un ISBN,
// le prix public est unique (loi Lang) : le prix "order" doit être celui imprimé sur
// le coffret et pratiqué par les revendeurs.

const OFFERS = {
  'standard': {
    label: 'Standard',
    stripeName: 'Standard - Oracle Oradia',
    priceCents: { preorder: 3800, order: 4200 },
    stockMax: null // illimité
  },
  'guidance-incluse': {
    label: 'Guidance Offerte',
    stripeName: 'Guidance Offerte - Oracle Oradia',
    priceCents: { preorder: 4800, order: 5200 },
    stockMax: null // illimité (séance de 30 min incluse)
  },
  'edition-signature': {
    label: 'Édition Signature',
    stripeName: 'Édition Signature - Oracle Oradia',
    priceCents: { preorder: 4200, order: 4600 },
    stockMax: 100 // 100 exemplaires, précommandes et commandes confondues
  }
};

const SALE_MODES = ['preorder', 'order'];

const PRODUCT_WEIGHT_KG = 0.8; // 800 g par coffret
const MAX_QUANTITY_PER_OFFER = 10;
const MAX_TOTAL_QUANTITY = 20; // 20 × 0,8 kg = 16 kg, dans la grille Mondial Relay

// Pays livrés (domicile et point relais) et format de leur code postal. La Suisse
// n'est pas livrée (hors UE, douane) mais reste acceptée en adresse de facturation.
const SHIPPING_COUNTRIES = ['FR', 'BE'];
const POSTAL_CODE_RULES = { FR: /^\d{5}$/, BE: /^\d{4}$/, CH: /^\d{4}$/ };
const POSTAL_CODE_LABELS = { FR: '5 chiffres', BE: '4 chiffres', CH: '4 chiffres' };

// Tarifs Mondial Relay France (euros, par tranche de poids).
const RATES_FR = {
  relay: [
    { maxWeight: 0.25, price: 4.10 }, { maxWeight: 0.5, price: 4.10 },
    { maxWeight: 1.0, price: 5.99 }, { maxWeight: 2.0, price: 7.99 },
    { maxWeight: 4.0, price: 7.99 }, { maxWeight: 5.0, price: 15.99 },
    { maxWeight: 7.0, price: 15.99 }, { maxWeight: 10.0, price: 15.99 },
    { maxWeight: 15.0, price: 25.99 }, { maxWeight: 25.0, price: 25.99 }
  ],
  home: [
    { maxWeight: 0.25, price: 4.99 }, { maxWeight: 0.5, price: 7.49 },
    { maxWeight: 1.0, price: 9.49 }, { maxWeight: 2.0, price: 10.99 },
    { maxWeight: 4.0, price: 16.39 }, { maxWeight: 5.0, price: 16.39 },
    { maxWeight: 7.0, price: 24.99 }, { maxWeight: 10.0, price: 24.99 },
    { maxWeight: 15.0, price: 31.49 }, { maxWeight: 25.0, price: 42.99 }
  ]
};
// Belgique : grille France en attendant les tarifs Mondial Relay Belgique réels —
// À VÉRIFIER avant les premiers envois belges.
const SHIPPING_RATES_BY_COUNTRY = { FR: RATES_FR, BE: RATES_FR };

// Texte affiché en mode vente ferme (page Commande, livraison, email).
const ORDER_SHIPPING_DELAY = 'Expédition sous 3 jours ouvrés';
const PREORDER_DELIVERY_ESTIMATE = 'Livraison estimée mi-février 2027';

function isValidSaleMode(mode) {
  return SALE_MODES.includes(mode);
}

function getOfferPriceCents(offerId, saleMode = 'preorder') {
  const offer = OFFERS[offerId];
  if (!offer) return null;
  return offer.priceCents[isValidSaleMode(saleMode) ? saleMode : 'preorder'];
}

function totalWeightKg(items) {
  return (items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0) * PRODUCT_WEIGHT_KG, 0);
}

// Frais de port en euros selon le poids, le mode et le pays de destination.
function calculateShippingEuros(weightKg, deliveryMethod, country = 'FR') {
  if (deliveryMethod === 'hand_delivery') return 0;
  const grid = (SHIPPING_RATES_BY_COUNTRY[country] || RATES_FR)[deliveryMethod];
  if (!grid) return 0;
  const tier = grid.find(r => weightKg <= r.maxWeight) || grid[grid.length - 1];
  return tier.price;
}

// Version sérialisable pour le navigateur (aucune donnée sensible).
// soldByOffer : { offerId: quantité déjà vendue } pour calculer le stock restant.
function getPublicCatalog(soldByOffer = {}) {
  const offers = {};
  for (const [id, o] of Object.entries(OFFERS)) {
    const sold = Number(soldByOffer[id]) || 0;
    offers[id] = {
      label: o.label,
      price: { preorder: o.priceCents.preorder / 100, order: o.priceCents.order / 100 },
      stockMax: o.stockMax,
      remaining: o.stockMax == null ? null : Math.max(0, o.stockMax - sold)
    };
  }
  return {
    offers,
    productWeightKg: PRODUCT_WEIGHT_KG,
    maxQuantityPerOffer: MAX_QUANTITY_PER_OFFER,
    maxTotalQuantity: MAX_TOTAL_QUANTITY,
    shippingCountries: SHIPPING_COUNTRIES,
    postalCodeRules: Object.fromEntries(Object.entries(POSTAL_CODE_RULES).map(([k, re]) => [k, re.source])),
    postalCodeLabels: POSTAL_CODE_LABELS,
    shippingRates: SHIPPING_RATES_BY_COUNTRY,
    orderShippingDelay: ORDER_SHIPPING_DELAY,
    preorderDeliveryEstimate: PREORDER_DELIVERY_ESTIMATE
  };
}

module.exports = {
  OFFERS,
  SALE_MODES,
  PRODUCT_WEIGHT_KG,
  MAX_QUANTITY_PER_OFFER,
  MAX_TOTAL_QUANTITY,
  SHIPPING_COUNTRIES,
  POSTAL_CODE_RULES,
  POSTAL_CODE_LABELS,
  SHIPPING_RATES_BY_COUNTRY,
  ORDER_SHIPPING_DELAY,
  PREORDER_DELIVERY_ESTIMATE,
  isValidSaleMode,
  getOfferPriceCents,
  totalWeightKg,
  calculateShippingEuros,
  getPublicCatalog
};
