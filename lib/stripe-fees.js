/**
 * Frais Stripe réels d'une période, lus depuis les balance transactions.
 *
 * Pourquoi ne pas garder une estimation par taux : le taux réel dépend de la carte
 * du client (une carte hors EEE coûte nettement plus cher qu'une carte européenne),
 * et Stripe prélève aussi des frais qui n'ont aucun rapport avec le montant encaissé
 * (Billing, Radar, litiges, conversion de devise). Un taux forfaitaire sous-estime
 * donc systématiquement ce qui sort réellement du compte.
 *
 * La seule source fiable est ce que Stripe a effectivement retenu, c'est-à-dire les
 * balance transactions du compte. Elles couvrent aussi les encaissements qui ne
 * passent pas par nos webhooks (guidances réglées via Cal.com, par exemple), que
 * l'ancienne estimation par `source` ratait complètement.
 */

const ESTIMATE_RATE = 0.015;      // 1,5 % — cartes européennes (tarif standard Stripe France)
const ESTIMATE_FIXED_EUR = 0.25;  // + 0,25 € par transaction

/**
 * Estimation de repli, utilisée uniquement si l'API Stripe est injoignable.
 * Un seul point de vérité pour tout le code : avant, le dashboard estimait à 1,5 %
 * et le rapport mensuel à 1,4 %, donc les deux écrans annonçaient deux chiffres
 * différents pour le même mois.
 */
function estimateStripeFees(totalEur, transactionCount) {
    return Math.max(0, (Number(totalEur) || 0) * ESTIMATE_RATE + ESTIMATE_FIXED_EUR * (Number(transactionCount) || 0));
}

function toUnixSeconds(value) {
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(ms)) throw new Error(`Date invalide: ${value}`);
    return Math.floor(ms / 1000);
}

/**
 * Frais Stripe réellement prélevés entre startDate (inclus) et endDate (exclu).
 *
 * @returns {Promise<{ok: true, feesEur: number, processingFeesEur: number,
 *                     otherFeesEur: number, grossEur: number, netEur: number,
 *                     chargeCount: number, refundCount: number}
 *                  | {ok: false, error: string}>}
 *          `ok: false` plutôt qu'une exception : l'appelant doit pouvoir retomber
 *          sur l'estimation et envoyer quand même son rapport.
 */
async function getStripeFeesForPeriod(startDate, endDate) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return { ok: false, error: 'STRIPE_SECRET_KEY absent' };

    try {
        const stripe = require('stripe')(secretKey);

        let processingFeeCents = 0;   // commissions prélevées sur les encaissements
        let otherFeeCents = 0;        // frais Stripe hors encaissement (Billing, Radar, FX…)
        let grossCents = 0;
        let netCents = 0;
        let chargeCount = 0;
        let refundCount = 0;

        const params = {
            created: { gte: toUnixSeconds(startDate), lt: toUnixSeconds(endDate) },
            limit: 100
        };

        for await (const bt of stripe.balanceTransactions.list(params)) {
            // Les frais de service Stripe arrivent comme des lignes négatives sans `fee` :
            // c'est le montant lui-même qui est le frais.
            if (bt.type === 'stripe_fee' || bt.type === 'stripe_fx_fee') {
                otherFeeCents += Math.max(0, -(bt.amount || 0));
                continue;
            }

            processingFeeCents += bt.fee || 0;
            netCents += bt.net || 0;
            grossCents += bt.amount || 0;

            if (bt.type === 'charge' || bt.type === 'payment') chargeCount++;
            if (bt.type === 'refund' || bt.type === 'payment_refund') refundCount++;
        }

        const toEur = cents => Math.round(cents) / 100;
        return {
            ok: true,
            feesEur: toEur(processingFeeCents + otherFeeCents),
            processingFeesEur: toEur(processingFeeCents),
            otherFeesEur: toEur(otherFeeCents),
            grossEur: toEur(grossCents),
            netEur: toEur(netCents - otherFeeCents),
            chargeCount,
            refundCount
        };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * Frais réels du mois, avec cache Supabase (table `stripe_monthly_fees`).
 *
 * Le cache sert à deux choses : ne pas rappeler l'API Stripe à chaque ouverture du
 * dashboard, et garder une trace auditable de ce qui a été retenu mois par mois —
 * un mois clôturé ne bouge plus, on n'a donc pas à le recalculer indéfiniment.
 *
 * @param {object} supabase client Supabase (service role)
 * @param {string} monthKey 'YYYY-MM'
 * @param {object} [options] `{ forceRefresh: boolean }`
 */
async function getMonthlyStripeFees(supabase, monthKey, options = {}) {
    const { forceRefresh = false } = options;
    const [year, month] = monthKey.split('-').map(n => parseInt(n, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return { ok: false, error: `monthKey invalide: ${monthKey}` };
    }

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const monthIsClosed = end.getTime() <= Date.now();

    if (!forceRefresh && supabase) {
        const { data: cached } = await supabase
            .from('stripe_monthly_fees')
            .select('*')
            .eq('month', `${monthKey}-01`)
            .maybeSingle();

        // Un mois en cours change encore : on ne sert le cache que pour un mois clos.
        if (cached && monthIsClosed) {
            return {
                ok: true,
                fromCache: true,
                feesEur: parseFloat(cached.fees_eur) || 0,
                processingFeesEur: parseFloat(cached.processing_fees_eur) || 0,
                otherFeesEur: parseFloat(cached.other_fees_eur) || 0,
                grossEur: parseFloat(cached.gross_eur) || 0,
                netEur: parseFloat(cached.net_eur) || 0,
                chargeCount: cached.charge_count || 0,
                refundCount: cached.refund_count || 0
            };
        }
    }

    const fresh = await getStripeFeesForPeriod(start, end);
    if (!fresh.ok) return fresh;

    if (supabase) {
        const { error } = await supabase.from('stripe_monthly_fees').upsert({
            month: `${monthKey}-01`,
            fees_eur: fresh.feesEur,
            processing_fees_eur: fresh.processingFeesEur,
            other_fees_eur: fresh.otherFeesEur,
            gross_eur: fresh.grossEur,
            net_eur: fresh.netEur,
            charge_count: fresh.chargeCount,
            refund_count: fresh.refundCount,
            fetched_at: new Date().toISOString()
        }, { onConflict: 'month' });
        if (error) console.error('[stripe-fees] cache upsert:', error.message);
    }

    return { ...fresh, fromCache: false };
}

/**
 * Frais Stripe réel de chaque encaissement sur une période, avec son PaymentIntent —
 * même source (balance transactions) que getStripeFeesForPeriod, mais ligne par ligne
 * au lieu d'un seul total agrégé. Sert à rattacher le frais exact à chaque précommande/
 * don (payment_intent_id), sans dépendre d'un export CSV qui se périme dès la
 * transaction suivante — l'API est interrogée à la demande, toujours à jour.
 *
 * @returns {Promise<{ok: true, details: Array<{paymentIntentId: string, feeEur: number,
 *                     netEur: number, amountEur: number}>} | {ok: false, error: string}>}
 */
async function getStripeFeesDetail(startDate, endDate) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return { ok: false, error: 'STRIPE_SECRET_KEY absent' };

    try {
        const stripe = require('stripe')(secretKey);
        const details = [];
        const params = {
            created: { gte: toUnixSeconds(startDate), lt: toUnixSeconds(endDate) },
            limit: 100,
            // Expanse la Charge sous-jacente pour lire son PaymentIntent — c'est la seule
            // référence Stripe que preorders/donors stockent (payment_intent_id).
            expand: ['data.source']
        };

        for await (const bt of stripe.balanceTransactions.list(params)) {
            if (bt.type !== 'charge' && bt.type !== 'payment') continue;
            const charge = bt.source;
            const pi = charge && typeof charge === 'object' ? charge.payment_intent : null;
            if (!pi) continue;
            details.push({
                paymentIntentId: typeof pi === 'string' ? pi : pi.id,
                feeEur: Math.round(bt.fee || 0) / 100,
                netEur: Math.round(bt.net || 0) / 100,
                amountEur: Math.round(bt.amount || 0) / 100
            });
        }

        return { ok: true, details };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

module.exports = {
    ESTIMATE_RATE,
    ESTIMATE_FIXED_EUR,
    estimateStripeFees,
    getStripeFeesForPeriod,
    getMonthlyStripeFees,
    getStripeFeesDetail
};
