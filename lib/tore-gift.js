// lib/tore-gift.js
// « 1 mois de Tore offert » avec l'achat de l'oracle physique.
//
// Piloté par l'interrupteur oracle_tore_gift (Dashboard > Paramètres > Fonctionnalités >
// Boutique), DÉSACTIVÉ par défaut : avec un ISBN, la loi Lang n'autorise une prime
// (cadeau lié à l'achat d'un livre) que si l'éditeur la propose à tous les vendeurs aux
// mêmes conditions — à activer seulement si le même code est aussi glissé dans les
// coffrets vendus en boutique.
//
// Chaque commande reçoit un code promotion Stripe unique (usage unique, nouveaux
// abonnés seulement) rattaché à un coupon 100 % sur le premier mois, créé à la volée
// s'il n'existe pas. Le client le saisit sur la page de paiement de l'abonnement
// (allow_promotion_codes, voir api/create-checkout-session.js).

const crypto = require('crypto');

const TORE_GIFT_COUPON_ID = process.env.STRIPE_TORE_GIFT_COUPON || 'oradia-tore-1-mois-offert';

async function isToreGiftEnabled(supabase) {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'oracle_tore_gift')
      .maybeSingle();
    if (error || !data) return false; // défaut explicite : désactivé
    return data.enabled === true;
  } catch {
    return false;
  }
}

async function ensureToreGiftCoupon(stripe) {
  try {
    return await stripe.coupons.retrieve(TORE_GIFT_COUPON_ID);
  } catch (err) {
    if (err?.statusCode !== 404 && err?.code !== 'resource_missing') throw err;
    return stripe.coupons.create({
      id: TORE_GIFT_COUPON_ID,
      name: "1 mois d'abonnement au tirage du Tore offert",
      percent_off: 100,
      duration: 'once'
    });
  }
}

// Crée un code unique (ex. ORADIA-7K3F9Q). Retourne la chaîne à communiquer au client.
async function createToreGiftCode(stripe, { sessionId, email }) {
  await ensureToreGiftCoupon(stripe);
  const code = 'ORADIA-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  const promo = await stripe.promotionCodes.create({
    coupon: TORE_GIFT_COUPON_ID,
    code,
    max_redemptions: 1,
    restrictions: { first_time_transaction: true },
    metadata: { source: 'oracle-physique', stripe_session_id: sessionId || '', email: email || '' }
  });
  return promo.code;
}

module.exports = { TORE_GIFT_COUPON_ID, isToreGiftEnabled, createToreGiftCode };
