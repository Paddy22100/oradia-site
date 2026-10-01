const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendBrevoEmail, shippingFromOrder } = require('../lib/brevo-order-email.js');
// Emails abonnés : une seule implémentation partagée avec le dashboard (voir CLAUDE.md).
const { sendToreSubscriptionEmail, sendSubscriptionEmail } = require('../lib/tore-subscription-email.js');
const { sendGuidanceConfirmationEmail, formatGuidanceDate } = require('../lib/guidance-email.js');
const { hitRateLimit } = require('../lib/rate-limit.js');

// Échec d'écriture en base pendant le traitement d'un paiement : l'erreur remonte
// jusqu'au handler, qui répond 500 pour que Stripe relivre l'événement (il réessaie
// automatiquement pendant 3 jours). Chaque branche est idempotente à la relivraison
// (upsert sur stripe_session_id, email_sent_at, contrainte unique transactions.source_ref).
function fail(message) {
    return new Error(`[webhook] ${message}`);
}

// Doublon sur transactions.source_ref (contrainte unique) : attendu quand Stripe relivre
// un événement déjà comptabilisé — pas une erreur à journaliser.
const isDuplicateKey = (error) => error?.code === '23505';

// Alerte admin quand un événement Stripe n'a pas pu être traité. Dédoublonnée par
// événement (Stripe relivre jusqu'à ~15 fois) grâce à la table api_rate_limits ;
// si la table n'existe pas encore, on préfère plusieurs emails qu'aucun.
async function sendWebhookFailureAlert(supabase, event, err) {
    try {
        const slot = await hitRateLimit(supabase, {
            bucket: 'webhook-alert', key: event.id, windowSeconds: 4 * 86400, max: 1
        });
        if (!slot.allowed) return;
        if (!process.env.BREVO_API_KEY) return;
        const obj = event.data?.object || {};
        const email = obj.customer_details?.email || obj.customer_email || obj.metadata?.email || '—';
        await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender: { name: 'Oradia Système', email: 'contact@oradia.fr' },
                to: [{ email: 'contact@oradia.fr' }],
                subject: '⚠️ Oradia — Paiement Stripe non traité (nouvelle tentative en cours)',
                htmlContent: `
                    <p>Le webhook Stripe n'a pas pu traiter l'événement <strong>${event.type}</strong>
                    (<code>${event.id}</code>).</p>
                    <p>Client : <strong>${String(email).replace(/[<>&"]/g, '')}</strong><br>
                    Objet Stripe : <code>${obj.id || '—'}</code></p>
                    <p>Erreur : <code>${String(err?.message || err).replace(/[<>&]/g, '').slice(0, 500)}</code></p>
                    <p>Stripe va relivrer l'événement automatiquement pendant 3 jours. Si l'erreur
                    persiste, vérifie Supabase puis relance l'événement depuis le dashboard Stripe
                    (Développeurs › Webhooks › événement › Renvoyer).</p>
                `
            })
        });
    } catch (e) {
        console.error('[webhook] Alerte échec non envoyée:', e.message);
    }
}

// Comptes à ne jamais compter dans la comptabilité (audit/test + compte personnel du fondateur)
const ACCOUNTING_EXCLUDED_EMAILS = ['boucheron.r89@gmail.com', 'audit@oradia.fr', 'contact@oradia.fr'];
const isAccountingExcluded = (email) => !!email && ACCOUNTING_EXCLUDED_EMAILS.includes(String(email).toLowerCase().trim());

// Fonctions pour créer les clients après validation environnement
function getStripeClient() {
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

function getSupabaseClient() {
    // URL Supabase du projet oradia-prod (nxzetkdozynyutlbhxdx)
    const supabaseUrl = process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return createClient(supabaseUrl, supabaseKey);
}

// Validation des variables d'environnement critiques
function validateEnvironment() {
    const missing = [];

    if (!process.env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');

    if (missing.length > 0) {
        throw new Error(`Configuration error: Missing ${missing.join(', ')}`);
    }

    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
        throw new Error('Invalid STRIPE_SECRET_KEY format');
    }
}


const handler = async (req, res) => {
    if ((req.url || '').includes('cal-webhook')) {
        return handleCalWebhook(req, res);
    }
    try {
        validateEnvironment();

        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        // Lire le body brut pour les logs
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks);

        // Logs de diagnostic
        console.log('[webhook] Event received:', req.headers['stripe-signature'] ? 'sig present' : 'NO SIG');
        console.log('[webhook] Secret defined:', !!process.env.STRIPE_WEBHOOK_SECRET);
        console.log('[webhook] Body length:', rawBody?.length);

        if (!sig || !webhookSecret) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request',
                message: 'Signature manquante'
            });
        }

        // Création des clients après validation
        const stripe = getStripeClient();
        const supabase = getSupabaseClient();

        let event;
        try {
            // Construire l'événement Stripe avec le raw body réel
            event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({ 
                success: false,
                error: 'Invalid request',
                message: 'Signature invalide'
            });
        }

        console.log(`Webhook event: ${event.type}`);

        // Traiter l'événement AVANT de répondre à Stripe.
        // Sur Vercel, la fonction serverless est interrompue dès que la réponse est
        // envoyée — un pattern "fire and forget" après res.json() ne s'exécuterait
        // jamais. On attend donc la fin du traitement (DB + email) avant le 200.
        // La limite d'exécution Vercel Hobby est 10 s — largement suffisant.
        try {
            await processEvent(event);
        } catch (err) {
            console.error('[webhook] Processing error:', err);
            // 500 → Stripe relivre l'événement (backoff exponentiel, 3 jours). Avant, on
            // répondait 200 même en cas d'échec : un raté ponctuel de Supabase laissait un
            // client débité sans commande enregistrée ni email, sans aucune nouvelle tentative.
            await sendWebhookFailureAlert(supabase, event, err);
            return res.status(500).json({ received: false, error: 'processing_failed' });
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook processing error:', error.message);
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error', 
            message: 'Une erreur est survenue lors du traitement'
        });
    }
};

// Résout l'email associé à une facture/abonnement Stripe (pour corréler avec
// `tore_subscriptions.email`, qui est la seule clé de correspondance disponible
// côté Supabase pour le moment — la table ne stocke pas encore l'ID client Stripe).
async function resolveCustomerEmail(stripe, object) {
    if (object?.customer_email) return object.customer_email;
    if (object?.customer_details?.email) return object.customer_details.email;
    if (object?.customer) {
        try {
            const customer = await stripe.customers.retrieve(
                typeof object.customer === 'string' ? object.customer : object.customer.id
            );
            if (customer && !customer.deleted) return customer.email || null;
        } catch (e) {
            console.error('[webhook] Échec récupération customer Stripe:', e.message);
        }
    }
    return null;
}

// Extrait l'ID d'abonnement d'une facture ou d'un objet abonnement, en gérant
// à la fois l'ancien format (`invoice.subscription`, racine) et le nouveau
// (API Stripe récente : `invoice.parent.subscription_details.subscription`,
// ou au niveau des lignes de facture). Le champ racine `invoice.subscription`
// a été retiré des versions d'API récentes.
function getSubscriptionIdFromObject(object) {
    if (!object) return null;
    if (object.object === 'subscription' && object.id) return object.id;
    const fromRoot = object.subscription;
    const fromParent = object.parent?.subscription_details?.subscription;
    const line = Array.isArray(object.lines?.data) ? object.lines.data[0] : null;
    const fromLine = line?.subscription
        || line?.parent?.subscription_item_details?.subscription
        || line?.subscription_details?.subscription;
    const id = fromRoot || fromParent || fromLine || null;
    return (typeof id === 'string' ? id : id?.id) || null;
}

// Retrouve la ligne `tore_subscriptions` correspondant à un événement Stripe
// d'abonnement/facture. Priorité aux identifiants Stripe stables
// (`stripe_subscription_id`, puis `stripe_customer_id`), stockés depuis la
// création de l'abonnement — bien plus fiables qu'une recherche par email
// (qui peut échouer si le client modifie son adresse côté Stripe). On garde
// la recherche par email en dernier recours pour les abonnements créés avant
// l'ajout de ces colonnes.
async function findToreSubscriptionRow(stripe, supabase, object) {
    const subscriptionId = getSubscriptionIdFromObject(object);
    const customerId = object?.customer
        ? (typeof object.customer === 'string' ? object.customer : object.customer.id)
        : null;

    if (subscriptionId) {
        const { data } = await supabase
            .from('tore_subscriptions')
            .select('id, email, is_free, full_name, lang')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();
        if (data) return data;
    }

    if (customerId) {
        const { data } = await supabase
            .from('tore_subscriptions')
            .select('id, email, is_free, full_name, lang')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
        if (data) return data;
    }

    const email = await resolveCustomerEmail(stripe, object);
    if (email) {
        const { data } = await supabase
            .from('tore_subscriptions')
            .select('id, email, is_free, full_name, lang')
            .ilike('email', email)
            .maybeSingle();
        if (data) return data;
        // Pas de ligne existante mais un email résolu : on peut quand même
        // cibler la mise à jour par email (utile si la ligne est créée entre-temps).
        return { id: null, email };
    }

    return null;
}

// Active un abonnement Tore : crée le compte membre (si nécessaire), enregistre
// la ligne tore_subscriptions, ajoute le contact newsletter et envoie l'email de
// bienvenue. Appelée à la fois par checkout.session.completed (cas normal) et en
// filet de sécurité par invoice.payment_succeeded (cas d'un 1er prélèvement qui a
// d'abord échoué puis réussi via une nouvelle tentative automatique de Stripe,
// sans repasser par checkout.session.completed).
// trialSource : 'oracle-qr' pour le mois d'essai offert avec l'oracle (lib/oracle-trial.js).
async function activateToreSubscription(supabase, { email, fullName, plan, stripeCustomerId, stripeSubscriptionId, amountTotalCents, sourceRef, paymentIntentId, trialSource = null, lang = 'fr' }) {
    if (!email) { console.error('[webhook] activateToreSubscription: email manquant'); return; }

    // .ilike() (insensible à la casse) : email arrive normalisé en minuscules, mais une
    // ligne déjà en base a pu être créée avant cette normalisation (ex: capturée telle
    // quelle depuis un formulaire). Sans ça, une ligne existante avec une majuscule ne
    // serait pas détectée ici, et l'upsert plus bas (onConflict: 'email', contrainte
    // Postgres sensible à la casse) créerait un doublon au lieu de la mettre à jour.
    const { data: existingRow } = await supabase
        .from('tore_subscriptions')
        .select('id, email')
        .ilike('email', email)
        .single();

    let tempPassword = null;
    let resetLink = null;

    // Génère un lien de réinitialisation à usage unique — sûr dans tous les cas car il
    // ne révèle jamais un mot de passe qui pourrait ne pas être le bon.
    async function generateSafeResetLink() {
        try {
            const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
                type: 'recovery',
                email,
                options: { redirectTo: 'https://oradia.fr/member/reset-password.html' }
            });
            if (linkErr) console.error('[webhook] generateLink error:', linkErr.message);
            else return linkData?.properties?.action_link || null;
        } catch (e) {
            console.error('[webhook] generateLink exception:', e.message);
        }
        return null;
    }

    if (!existingRow) {
        tempPassword = crypto.randomBytes(8).toString('hex');
        const { error: authError } = await supabase.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
                full_name: fullName || '',
                subscription_type: 'tore',
                subscription_active: true,
                must_change_password: true,
                lang: lang === 'en' ? 'en' : 'fr' // langue de l'email Supabase de réinitialisation
            }
        });

        if (authError) {
            console.error('[webhook] Supabase Auth createUser error:', authError.message);
            // On ne sait pas si le mot de passe généré ici correspond réellement au
            // compte (ex: livraison en double du webhook, compte déjà créé par un
            // appel concurrent) — ne jamais envoyer un mot de passe qui pourrait être
            // faux. On propose à la place un lien de réinitialisation sécurisé.
            tempPassword = null;
            resetLink = await generateSafeResetLink();
        }
    } else {
        // Une ligne tore_subscriptions existante ne garantit PAS que le client connaît
        // encore son mot de passe (ligne créée manuellement, très ancienne, ou compte
        // jamais vraiment utilisé) : plutôt que de supposer qu'il le connaît et de ne
        // rien lui envoyer d'actionnable, on lui propose systématiquement un lien de
        // réinitialisation sécurisé, comme le fait déjà le bouton « Réparer l'accès ».
        resetLink = await generateSafeResetLink();
    }

    const accessCode = 'TORE-' + Date.now().toString(36).toUpperCase();
    const expireAt = new Date();
    expireAt.setMonth(expireAt.getMonth() + 1);

    const subPayload = {
        email,
        full_name:    fullName || '',
        access_code:  accessCode,
        status:       'active',
        expires_at:   expireAt.toISOString(),
        plan:         plan || 'complet',
        stripe_customer_id:     stripeCustomerId || null,
        stripe_subscription_id: stripeSubscriptionId || null,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString()
    };

    // Si une ligne existante a été trouvée (même avec une casse différente), on cible sa
    // mise à jour par id — jamais par email — pour ne pas dépendre de la contrainte
    // d'unicité Postgres (sensible à la casse) et éviter de créer un doublon.
    const { data: savedRow, error: subError } = existingRow
        ? await supabase.from('tore_subscriptions').update(subPayload).eq('id', existingRow.id).select('id').single()
        : await supabase.from('tore_subscriptions').upsert(subPayload, { onConflict: 'email' }).select('id').single();

    if (subError) throw fail(`tore_subscriptions upsert error: ${subError.message}`);

    // Séparé de l'upsert principal (colonne ajoutée par une migration facultative) :
    // si elle n'a pas encore été appliquée, on ne veut pas faire échouer la création
    // du compte/abonnement pour autant — juste dégrader l'indicateur dashboard.
    if (savedRow?.id) {
        const { error: mcpErr } = await supabase
            .from('tore_subscriptions')
            .update({ must_change_password: !!(tempPassword || resetLink) })
            .eq('id', savedRow.id);
        if (mcpErr) console.error('[webhook] must_change_password update (migration appliquée ?):', mcpErr.message);
    }

    // Langue des emails de cet abonné (échec de paiement, fin d'abonnement, relance,
    // réparation d'accès). Mise à jour séparée : n'empêche jamais l'activation.
    if (savedRow?.id) {
        const { error: langErr } = await supabase
            .from('tore_subscriptions')
            .update({ lang: lang === 'en' ? 'en' : 'fr' })
            .eq('id', savedRow.id);
        if (langErr) console.error('[webhook] lang update (migration appliquée ?):', langErr.message);
    }

    if (trialSource && savedRow?.id) {
        const { error: trialErr } = await supabase
            .from('tore_subscriptions')
            .update({ trial_source: trialSource })
            .eq('id', savedRow.id);
        if (trialErr) console.error('[webhook] trial_source update:', trialErr.message);
        else await require('../lib/oracle-trial.js').checkOracleTrialAlert(supabase);
    }

    // Essai gratuit : 0 € encaissé, pas de recette (la contrainte transactions.amount > 0
    // la refuserait) — la première vraie recette arrive avec invoice.paid en fin d'essai.
    if (!isAccountingExcluded(email) && (amountTotalCents || 0) > 0) {
        await supabase.from('transactions').insert({
            date: new Date().toISOString().split('T')[0],
            type: 'recette',
            category: 'abonnement',
            description: `Abonnement Tore ${plan || 'complet'} — ${fullName || email}`,
            amount: (amountTotalCents || 0) / 100,
            source: 'abonnement',
            source_ref: sourceRef,
            // Rattachement direct des frais Stripe réels pour ce tout premier paiement
            // (Checkout Session) — voir supabase-migration-transactions-stripe-fees.sql.
            payment_intent_id: paymentIntentId || null
        }).then(({ error }) => { if (error && !isDuplicateKey(error)) console.error('[webhook] transactions insert (abonnement):', error.message); });
    }

    // Contact Brevo créé/mis à jour AVANT l'écriture Supabase, pour pouvoir refléter le
    // résultat réel dans brevo_synced (au lieu de le laisser bloqué à false indéfiniment,
    // ce qui gonflait à tort le compteur "Contacts non sync Brevo" du dashboard).
    let brevoContactSynced = false;
    if (process.env.BREVO_API_KEY) {
        const nameParts = (fullName || '').trim().split(' ');
        try {
            const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
                body: JSON.stringify({
                    email,
                    attributes: {
                        PRENOM: nameParts[0] || '',
                        NOM:    nameParts.slice(1).join(' ') || ''
                    },
                    listIds: [5],
                    updateEnabled: true
                })
            });
            brevoContactSynced = brevoRes.ok || brevoRes.status === 409; // 409 = déjà présent
        } catch (e) { console.error('[webhook] Brevo add to list 5:', e.message); }
    }

    await supabase.from('newsletter_contacts').upsert({
        email,
        full_name: fullName || '',
        source:   'abonnement-tore',
        tags:     ['abonne-tore'],
        status:   'active',
        brevo_synced: brevoContactSynced,
        ...(brevoContactSynced ? { brevo_synced_at: new Date().toISOString() } : {})
    }, { onConflict: 'email', ignoreDuplicates: false }).catch(e =>
        console.error('[webhook] newsletter_contacts upsert:', e.message)
    );

    await sendToreSubscriptionEmail({
        toEmail:  email,
        toName:   fullName || '',
        tempPassword,
        resetLink,
        plan: plan || 'complet',
        lang // 'en' si souscrit depuis le tirage anglais (métadonnées Stripe), sinon français
    });
}

// Fonction séparée pour le traitement asynchrone
async function processEvent(event) {
    switch (event.type) {
        // ── Renouvellement d'abonnement Tore (paiement périodique réussi) ───
        // Stripe ne renvoie PAS de `checkout.session.completed` aux renouvellements
        // d'un abonnement récurrent : il faut écouter `invoice.payment_succeeded`
        // (ou `invoice.paid`) pour prolonger `expires_at`, sinon l'accès du client
        // est coupé après un mois alors qu'il continue d'être prélevé.
        case 'invoice.payment_succeeded':
        case 'invoice.paid': {
            const stripe = getStripeClient();
            const supabase = getSupabaseClient();
            const invoice = event.data.object;

            const invSubId = getSubscriptionIdFromObject(invoice);
            if (!invSubId) break;

            const row = await findToreSubscriptionRow(stripe, supabase, invoice);

            if (invoice.billing_reason === 'subscription_create') {
                // Normalement déjà géré par checkout.session.completed (Stripe envoie
                // les deux événements pour la 1ère facture). On ne recrée / ne prolonge
                // que si AUCUNE ligne n'existe encore pour cet abonnement — cas où
                // checkout.session.completed n'a jamais abouti (ex : 1er prélèvement
                // échoué puis réussi via une nouvelle tentative automatique de Stripe,
                // sans repasser par le tunnel de paiement).
                if (row && row.id) break; // déjà activé normalement, rien à faire ici

                const subscription = await stripe.subscriptions.retrieve(invSubId).catch(() => null);
                const email = (invoice.customer_email
                    || subscription?.metadata?.email
                    || await resolveCustomerEmail(stripe, invoice)
                    || '').trim().toLowerCase() || null;

                if (!email) {
                    console.error('[webhook] Fallback activation impossible : email introuvable pour sub', invSubId);
                    break;
                }

                await activateToreSubscription(supabase, {
                    email,
                    fullName: subscription?.metadata?.full_name || invoice.customer_name || '',
                    plan: subscription?.metadata?.plan || 'complet',
                    stripeCustomerId: invoice.customer || null,
                    stripeSubscriptionId: invSubId,
                    amountTotalCents: invoice.amount_paid || 0,
                    sourceRef: invoice.id,
                    trialSource: subscription?.metadata?.trial_source || null,
                    lang: subscription?.metadata?.lang === 'en' ? 'en' : 'fr'
                });
                console.log(`[webhook] Abonnement Tore activé en filet de sécurité (invoice.payment_succeeded) pour ${email}`);
                break;
            }

            // Renouvellement normal (facture périodique, hors 1ère facture)
            if (!row || !row.email) {
                console.error('[webhook] invoice.payment_succeeded : abonnement introuvable, sub:', invSubId);
                break;
            }

            const newExpireAt = new Date();
            newExpireAt.setMonth(newExpireAt.getMonth() + 1);

            const { error: renewError } = await supabase
                .from('tore_subscriptions')
                .update({
                    status: 'active',
                    expires_at: newExpireAt.toISOString(),
                    stripe_subscription_id: invSubId || null,
                    stripe_customer_id: invoice.customer || null,
                    updated_at: new Date().toISOString()
                })
                .eq('email', row.email);

            if (renewError) {
                throw fail(`Échec prolongation abonnement Tore: ${renewError.message}`);
            } else {
                console.log(`[webhook] Abonnement Tore prolongé jusqu'au ${newExpireAt.toISOString()} pour ${row.email}`);
                // Enregistrement automatique de la recette (renouvellement mensuel)
                if (isAccountingExcluded(row.email) || row.is_free) { break; }
                await supabase.from('transactions').insert({
                    date: new Date().toISOString().split('T')[0],
                    type: 'recette',
                    category: 'abonnement',
                    description: `Renouvellement abonnement Tore — ${row.email}`,
                    amount: (invoice.amount_paid || 0) / 100,
                    source: 'abonnement',
                    source_ref: invoice.id
                }).then(({ error }) => { if (error && !isDuplicateKey(error)) console.error('[webhook] transactions insert (renouvellement):', error.message); });
            }
            break;
        }

        // ── Échec de prélèvement lors d'un renouvellement ───────────────────
        case 'invoice.payment_failed': {
            const stripe = getStripeClient();
            const supabase = getSupabaseClient();
            const invoice = event.data.object;
            if (!getSubscriptionIdFromObject(invoice)) {
                console.error('[webhook] invoice.payment_failed: aucun subscription id resolu, evenement ignore', invoice.id);
                break;
            }

            const row = await findToreSubscriptionRow(stripe, supabase, invoice);
            if (!row || !row.email) {
                console.error('[webhook] invoice.payment_failed: aucune ligne tore_subscriptions trouvee pour', invoice.id, invoice.customer);
                break;
            }

            const isFirstPayment = invoice.billing_reason === 'subscription_create';

            // Un tout nouvel abonné (aucune ligne tore_subscriptions existante) n'a
            // encore aucun accès à perdre : Stripe va retenter automatiquement le
            // prélèvement dans les jours qui suivent (Smart Retries). Le prévenir
            // maintenant avec un email de "paiement non abouti" est prématuré et
            // trompeur (il n'a jamais eu d'accès à "renouveler"). On se contente de
            // journaliser ; l'activation se fera normalement via checkout.session.completed
            // ou, en filet de sécurité, via invoice.payment_succeeded si le prélèvement finit
            // par réussir.
            if (isFirstPayment && !row.id) {
                console.log(`[webhook] 1er prélèvement échoué pour un nouvel abonné (${row.email}) — pas d'email, en attente d'une nouvelle tentative Stripe`);
                break;
            }

            const { error: failError } = await supabase
                .from('tore_subscriptions')
                .update({
                    status: 'payment_failed',
                    updated_at: new Date().toISOString()
                })
                .eq('email', row.email);

            if (failError) {
                throw fail(`Échec mise à jour statut payment_failed: ${failError.message}`);
            } else {
                console.log(`[webhook] Échec de paiement signalé pour l'abonnement Tore de ${row.email}`);
                // Attendu : Vercel interrompt la fonction dès la réponse envoyée.
                await sendSubscriptionEmail(row.email, row.full_name, isFirstPayment ? 'payment_failed_first' : 'payment_failed', row.lang).catch(e => console.error('[webhook] Email échec paiement:', e.message));
            }
            break;
        }

        // ── Annulation d'abonnement ──────────────────────────────────────────
        // Résiliation programmée / annulée (espace membre ou portail Stripe) : reflétée
        // dans tore_subscriptions pour l'interrupteur « renouvellement automatique ».
        case 'customer.subscription.updated': {
            const subscription = event.data.object;
            const prev = event.data.previous_attributes || {};
            if (!('cancel_at_period_end' in prev)) break;
            const supabase = getSupabaseClient();
            const { error: capeError } = await supabase
                .from('tore_subscriptions')
                .update({ cancel_at_period_end: !!subscription.cancel_at_period_end, updated_at: new Date().toISOString() })
                .eq('stripe_subscription_id', subscription.id);
            if (capeError) console.error('[webhook] cancel_at_period_end:', capeError.message);
            break;
        }

        case 'customer.subscription.deleted': {
            const stripe = getStripeClient();
            const supabase = getSupabaseClient();
            const subscription = event.data.object;

            const row = await findToreSubscriptionRow(stripe, supabase, subscription);
            if (!row || !row.email) break;
            if (!row.id) break; // jamais eu de ligne active — rien à annuler, rien à notifier

            const { error: cancelError } = await supabase
                .from('tore_subscriptions')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('email', row.email);

            if (cancelError) {
                throw fail(`Échec mise à jour statut cancelled: ${cancelError.message}`);
            } else {
                console.log(`[webhook] Abonnement Tore annulé pour ${row.email}`);
                // Attendu : Vercel interrompt la fonction dès la réponse envoyée.
                await sendSubscriptionEmail(row.email, row.full_name, 'cancelled', row.lang).catch(e => console.error('[webhook] Email annulation:', e.message));
            }
            break;
        }

        // Paiement différé (virement, prélèvement…) : la session est « complétée » avant
        // que l'argent n'arrive (payment_status 'unpaid'). On ne valide la vente qu'à
        // checkout.session.async_payment_succeeded, qui repasse par le même traitement.
        case 'checkout.session.async_payment_failed': {
                const supabase = getSupabaseClient();
                const session = event.data.object;
                const { error: failErr } = await supabase
                    .from('preorders')
                    .update({ paid_status: 'failed', updated_at: new Date().toISOString() })
                    .eq('stripe_session_id', session.id)
                    .eq('paid_status', 'pending');
                if (failErr) throw fail(`async_payment_failed: ${failErr.message}`);
                console.log(`[webhook] Paiement différé échoué: ${session.id}`);
                return;
            }

        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
                const stripe = getStripeClient();
                const supabase = getSupabaseClient();
                const session = event.data.object;
                const sessionId = session.id;

                if (session.payment_status === 'unpaid') {
                    console.log(`[webhook] Session ${sessionId} complétée, paiement différé en attente`);
                    return;
                }

                console.log(`Session completed: ${sessionId}`);
                
                // Extraction robuste des données avec fallbacks
                const extractedData = {
                    // Email avec fallbacks multiples — normalisé en minuscules dès l'extraction :
                    // session.metadata.email vient tel quel du formulaire frontend (non
                    // normalisé), et tore_subscriptions est une table Postgres classique où
                    // .eq('email', ...) est sensible à la casse. Sans cette normalisation, un
                    // client dont l'email contient une majuscule apparaissait "non abonné" à
                    // la connexion malgré un paiement réel.
                    email: (session.customer_details?.email ||
                           session.customer_email ||
                           session.metadata?.email ||
                           '').trim().toLowerCase() || null,
                    
                    // Offer depuis metadata (plus de fallback items)
                    offer: session.metadata?.offer || null,
                    
                    // Nom complet avec fallbacks
                    full_name: session.metadata?.full_name || 
                              session.customer_details?.name || 
                              null,
                    
                    // Adresse avec fallbacks metadata prioritaire
                    shipping_address: session.metadata?.shipping_address || 
                                    session.customer_details?.address?.line1 || 
                                    null,
                    
                    // Complément d'adresse
                    address_complement: session.metadata?.address_complement || null,
                    
                    // Code postal avec fallbacks
                    postal_code: session.metadata?.postal_code || 
                                 session.customer_details?.address?.postal_code || 
                                 null,
                    
                    // Ville avec fallbacks
                    city: session.metadata?.city || 
                          session.customer_details?.address?.city || 
                          null,
                    
                    // Pays avec fallbacks
                    country: session.metadata?.country || 
                           session.customer_details?.address?.country || 
                           null,
                    
                    // Téléphone avec fallbacks
                    phone: session.customer_details?.phone || 
                          session.metadata?.phone || 
                          null,
                    
                    // Champs Stripe avec fallbacks null
                    stripe_customer_id: session.customer || null,
                    payment_intent_id: session.payment_intent || null,
                    
                    // Champs monétaires
                    amount_total: session.amount_total || 0,
                    currency: session.currency || 'eur',
                    
                    // Session ID
                    stripe_session_id: sessionId,
                    
                    // Status
                    paid_status: 'completed',
                    
                    // Champs livraison depuis metadata
                    shipping_method: session.metadata?.delivery_method || null,
                    shipping_price_cents: session.metadata?.delivery_price_cents || null,
                    
                    // Champs point relais depuis metadata
                    relay_id: session.metadata?.relay_id || null,
                    relay_name: session.metadata?.relay_name || null,
                    relay_address1: session.metadata?.relay_address1 || null,
                    relay_address2: session.metadata?.relay_address2 || null,
                    relay_postal_code: session.metadata?.relay_postal_code || null,
                    relay_city: session.metadata?.relay_city || null,
                    relay_country: session.metadata?.relay_country || null
                };

                // Validation des champs obligatoires
                if (!extractedData.email) {
                    console.error('Email manquant - envoi d\'email annulé mais webhook continue');
                    // Continuer le traitement sans envoyer d'email
                }

                // ── Gestion abonnement Tore ──────────────────────────────────────
                if (extractedData.offer === 'tore-subscription') {
                    await activateToreSubscription(supabase, {
                        email: extractedData.email,
                        fullName: extractedData.full_name,
                        plan: session.metadata?.plan || 'complet',
                        stripeCustomerId: session.customer || null,
                        stripeSubscriptionId: session.subscription || null,
                        amountTotalCents: extractedData.amount_total,
                        sourceRef: sessionId,
                        paymentIntentId: extractedData.payment_intent_id,
                        trialSource: session.metadata?.trial_source || null,
                        lang: session.metadata?.lang === 'en' ? 'en' : 'fr'
                    });

                    console.log(`[webhook] Tore subscription traitée: ${sessionId}`);
                    return;
                }

                // Gestion spéciale pour les contributions libres
                if (extractedData.offer === 'contribution-libre') {
                    const amountInEuros = extractedData.amount_total / 100;
                    
                    const donorData = {
                        stripe_session_id: extractedData.stripe_session_id,
                        payment_intent_id: extractedData.payment_intent_id,
                        email: extractedData.email,
                        full_name: extractedData.full_name || 'Soutien ORADIA',
                        offer: extractedData.offer,
                        amount_total: amountInEuros,
                        currency: extractedData.currency,
                        paid_status: 'completed',
                        source: 'oradia-contribution',
                        country: extractedData.country || 'FR'
                    };
                    
                    const { data: donorResult, error: donorError } = await supabase
                        .from('donors')
                        .upsert(donorData, {
                            onConflict: 'stripe_session_id',
                            ignoreDuplicates: false
                        })
                        .select()
                        .single();
                    
                    if (donorError) {
                        throw fail(`Insertion donors échouée: ${donorError.message}`);
                    }
                    
                    // Vérifier si email déjà envoyé
                    let emailSent = false;
                    if (donorResult.email && !donorResult.email_sent_at) {
                        emailSent = await sendBrevoEmail({
                            toEmail: donorResult.email,
                            toName: donorResult.full_name || 'Ami(e) d\'ORADIA',
                            offer: donorResult.offer,
                            amountTotal: Number(donorResult.amount_total).toFixed(2)
                        });
                        
                        if (emailSent) {
                            await supabase
                                .from('donors')
                                .update({ email_sent_at: new Date().toISOString() })
                                .eq('stripe_session_id', sessionId);
                        }
                    }
                    
                    // Enregistrement automatique de la recette
                    if (!isAccountingExcluded(donorResult.email)) {
                    await supabase.from('transactions').insert({
                        date: new Date().toISOString().split('T')[0],
                        type: 'recette',
                        category: 'don',
                        description: `Don — ${donorResult.full_name || donorResult.email || ''}`,
                        amount: amountInEuros,
                        source: 'don',
                        source_ref: sessionId
                    }).then(({ error }) => { if (error && !isDuplicateKey(error)) console.error('[webhook] transactions insert (don):', error.message); });
                    }

                    console.log(`[webhook] Don traité: ${sessionId} | Email:${emailSent ? 'OK' : 'Skipped'}`);
                    return;
                }

                // Validation des champs obligatoires pour précommandes
                if (!extractedData.offer) {
                    console.error('[webhook] Offer manquant - impossible de continuer:', sessionId);
                    return;
                }

                // Lire la commande existante pour fusionner avec les données Stripe
                const { data: existingOrder, error: existingOrderError } = await supabase
                    .from('preorders')
                    .select('*')
                    .eq('stripe_session_id', sessionId)
                    .maybeSingle();

                if (existingOrderError) {
                    throw fail(`Lecture preorders échouée: ${existingOrderError.message}`);
                }

                // Fusion intelligente du mode de livraison
                const mergedShippingMethod =
                    extractedData.shipping_method || existingOrder?.shipping_method || null;

                const supabaseData = {
                    stripe_session_id: extractedData.stripe_session_id,
                    email: extractedData.email || existingOrder?.email || null,
                    offer: extractedData.offer || existingOrder?.offer || null,
                    full_name: extractedData.full_name || existingOrder?.full_name || 'Client ORADIA',
                    amount_total: extractedData.amount_total / 100,
                    currency: extractedData.currency,
                    payment_intent_id: extractedData.payment_intent_id,
                    paid_status: extractedData.paid_status,
                    shipping_address: extractedData.shipping_address || existingOrder?.shipping_address || null,
                    address_complement: extractedData.address_complement || existingOrder?.address_complement || null,
                    postal_code: extractedData.postal_code || existingOrder?.postal_code || null,
                    city: extractedData.city || existingOrder?.city || null,
                    country: extractedData.country || existingOrder?.country || 'FR',
                    phone: extractedData.phone || existingOrder?.phone || null,
                    // Précommande ou vente ferme (metadata posée par create-checkout-session)
                    order_type: session.metadata?.sale_mode === 'order'
                        ? 'order'
                        : (existingOrder?.order_type || 'preorder'),
                    updated_at: new Date().toISOString(),

                    // Champs livraison fusionnés
                    shipping_method: mergedShippingMethod,
                    shipping_price_cents:
                        (() => {
                            const parsedShippingPrice =
                                extractedData.shipping_price_cents != null
                                    ? Number.parseInt(extractedData.shipping_price_cents, 10)
                                    : null;
                            return Number.isFinite(parsedShippingPrice)
                                ? parsedShippingPrice
                                : existingOrder?.shipping_price_cents ?? null;
                        })(),
                    shipping_provider:
                        mergedShippingMethod === 'relay' || mergedShippingMethod === 'home'
                            ? 'mondial_relay'
                            : existingOrder?.shipping_provider || null,

                    // Champs point relais
                    relay_id: extractedData.relay_id || existingOrder?.relay_id || null,
                    relay_name: extractedData.relay_name || existingOrder?.relay_name || null,
                    relay_address1: extractedData.relay_address1 || existingOrder?.relay_address1 || null,
                    relay_address2: extractedData.relay_address2 || existingOrder?.relay_address2 || null,
                    relay_postal_code: extractedData.relay_postal_code || existingOrder?.relay_postal_code || null,
                    relay_city: extractedData.relay_city || existingOrder?.relay_city || null,
                    relay_country: extractedData.relay_country || existingOrder?.relay_country || null
                };
                
                const { error: upsertError, data: upsertData } = await supabase
                    .from('preorders')
                    .upsert(supabaseData, {
                        onConflict: 'stripe_session_id',
                        ignoreDuplicates: false
                    })
                    .select()
                    .single();
                
                if (upsertError) {
                    throw fail(`Upsert preorders échoué: ${upsertError.message}`);
                }

                // Vérifier si email déjà envoyé
                let emailSent = false;
                if (upsertData.email && !upsertData.email_sent_at) {
                    // Récupérer la facture Stripe si disponible
                    let invoiceUrl = null;
                    if (session.invoice) {
                        try {
                            const invoice = await stripe.invoices.retrieve(session.invoice);
                            invoiceUrl = invoice.hosted_invoice_url || null;
                        } catch (invoiceError) {
                            console.error('Erreur récupération facture:', invoiceError.message);
                        }
                    }
                    
                    emailSent = await sendBrevoEmail({
                        toEmail: upsertData.email,
                        toName: upsertData.full_name || 'Ami(e) d\'ORADIA',
                        offer: upsertData.offer,
                        amountTotal: Number(upsertData.amount_total).toFixed(2),
                        invoiceUrl: invoiceUrl,
                        // Panier détaillé (enregistré à la création de la session Stripe)
                        items: upsertData.items,
                        shipping: shippingFromOrder(upsertData),
                        orderType: upsertData.order_type,
                        gift: upsertData.is_gift ? { message: upsertData.gift_message || '' } : null
                    });
                    
                    if (emailSent) {
                        await supabase
                            .from('preorders')
                            .update({ 
                                email_sent_at: new Date().toISOString(),
                                stripe_invoice_url: invoiceUrl 
                            })
                            .eq('stripe_session_id', sessionId);
                    }
                }
                
                // Enregistrement automatique de la recette
                if (!isAccountingExcluded(upsertData.email)) {
                await supabase.from('transactions').insert({
                    date: new Date().toISOString().split('T')[0],
                    type: 'recette',
                    category: upsertData.order_type === 'order' ? 'commande' : 'précommande',
                    description: `${upsertData.order_type === 'order' ? 'Commande' : 'Précommande'} ${upsertData.offer || ''} — ${upsertData.full_name || upsertData.email || ''}`,
                    amount: parseFloat(upsertData.amount_total) || 0,
                    // Même source pour précommande et vente ferme (vente de marchandise) : la
                    // comptabilité du dashboard (BIC, frais Stripe, rapport mensuel) filtre
                    // sur 'precommande'. Seules la catégorie et la description distinguent.
                    source: 'precommande',
                    source_ref: sessionId
                }).then(({ error }) => { if (error && !isDuplicateKey(error)) console.error('[webhook] transactions insert (precommande):', error.message); });
                }

                console.log(`[webhook] ${upsertData.order_type === 'order' ? 'Commande' : 'Précommande'} traitée: ${sessionId} | DB:OK | Email:${emailSent ? 'OK' : 'Skipped'}`);
                return;
            }
            
            // ── Session de paiement abandonnée (expire 24 h après sa création) ──
            // Marque la précommande "pending" correspondante sans changer son statut :
            // la relance panier abandonné (cron-relance, fenêtre 24-48 h) continue de la
            // cibler via paid_status = 'pending'.
            case 'checkout.session.expired': {
                const supabase = getSupabaseClient();
                const session = event.data.object;
                const { error: expError } = await supabase
                    .from('preorders')
                    .update({ checkout_expired_at: new Date().toISOString() })
                    .eq('stripe_session_id', session.id)
                    .eq('paid_status', 'pending');
                // Colonne absente (migration non exécutée) : sans importance, pas de relivraison.
                if (expError) console.warn('[webhook] checkout.session.expired:', expError.message);
                return;
            }

            default:
                console.log(`Event not handled: ${event.type}`);
                break;
        }
    }

async function handleCalWebhook(req, res) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);

    const sig = req.headers['x-cal-signature-256'];
    const secret = process.env.CAL_WEBHOOK_SECRET;
    if (secret) {
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        if (sig !== expected) {
            console.error('[cal-webhook] Signature invalide');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    }

    let body;
    try { body = JSON.parse(rawBody.toString()); }
    catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }

    const trigger = body.triggerEvent;
    const payload = body.payload || {};
    const bookingUid = payload.uid || '';
    const attendee = (payload.attendees || [])[0] || {};
    const clientEmail = attendee.email || '';
    const clientName = attendee.name || '';
    const duration = payload.length || 30;
    const amount = duration === 60 ? 6000 : 3000;
    const scheduledAt = payload.startTime || null;

    console.log(`[cal-webhook] ${trigger} — uid:${bookingUid} email:${clientEmail}`);

    const supabase = getSupabaseClient();

    if (trigger === 'BOOKING_PAID') {
        const calVideoUrl =
            payload.metadata?.videoCallUrl ||
            (typeof payload.location === 'string' && payload.location.startsWith('http') ? payload.location : null) ||
            payload.conferenceData?.entryPoints?.[0]?.uri ||
            null;
        const jitsiRoom = calVideoUrl ? null : 'oradia-' + crypto.randomBytes(8).toString('hex');
        const jitsiUrl  = calVideoUrl || `https://meet.jit.si/${jitsiRoom}`;

        let toreHistory = null;
        if (clientEmail) {
            try {
                const { data: tirages } = await supabase.rpc('admin_get_tirages_by_email', { p_email: clientEmail });
                if (tirages && tirages.length > 0) toreHistory = tirages;
            } catch (_) {}
        }

        const { data: guidance, error: gErr } = await supabase
            .from('guidances')
            .insert({
                client_email: clientEmail,
                client_name: clientName,
                duration,
                amount,
                scheduled_at: scheduledAt,
                jitsi_room: jitsiRoom,
                jitsi_url: jitsiUrl,
                cal_booking_uid: bookingUid,
                status: 'confirmed',
                tore_history: toreHistory
            })
            .select()
            .single();

        if (gErr) {
            console.error('[cal-webhook] Erreur insertion guidance:', gErr.message);
            return res.status(500).json({ error: 'DB error' });
        }

        // Enregistrement automatique de la recette
        if (!isAccountingExcluded(clientEmail)) {
        await supabase.from('transactions').insert({
            date: new Date().toISOString().split('T')[0],
            type: 'recette',
            category: 'guidance',
            description: `Guidance — ${clientName || clientEmail || ''}`,
            amount: (amount || 0) / 100,
            source: 'guidance',
            source_ref: bookingUid
        }).then(({ error }) => { if (error && !isDuplicateKey(error)) console.error('[webhook] transactions insert (guidance):', error.message); });
        }

        const dateStr = formatGuidanceDate(scheduledAt, 'fr'); // notification admin (française)
        // Réservation depuis /en/guidance.html : métadonnée Cal.com « lang » (voir l'embed).
        const clientLang = payload.metadata?.lang === 'en' ? 'en' : 'fr';

        if (clientEmail) {
            await sendGuidanceConfirmationEmail({ clientEmail, clientName, duration, dateStr: formatGuidanceDate(scheduledAt, clientLang), jitsiUrl, lang: clientLang })
                .catch(e => console.error('[cal-webhook] Email client:', e.message));
        }

        if (process.env.BREVO_API_KEY) {
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
                body: JSON.stringify({
                    sender: { email: process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr', name: 'Oradia Système' },
                    to: [{ email: 'contact@oradia.fr', name: 'Rudy' }],
                    subject: `[Admin] Nouvelle guidance ${duration}min — ${clientName || clientEmail}`,
                    htmlContent: `<p>Nouvelle guidance réservée :</p><ul><li><strong>Client :</strong> ${clientName} (${clientEmail})</li><li><strong>Durée :</strong> ${duration} min — ${amount / 100}€</li><li><strong>Date :</strong> ${dateStr}</li><li><strong>Jitsi :</strong> <a href="${jitsiUrl}">${jitsiUrl}</a></li><li><strong>Historique tirages :</strong> ${toreHistory ? toreHistory.length + ' tirage(s)' : 'aucun'}</li></ul>`,
                    textContent: `Nouvelle guidance\n${clientName} — ${duration}min\n${dateStr}\n${jitsiUrl}`
                })
            }).catch(e => console.error('[cal-webhook] Email admin:', e.message));
        }

        console.log(`[cal-webhook] Guidance créée: ${guidance.id}`);
    }

    else if (trigger === 'BOOKING_CANCELLED') {
        const { error } = await supabase.from('guidances').update({ status: 'cancelled' }).eq('cal_booking_uid', bookingUid);
        if (error) console.error('[cal-webhook] Cancel guidance:', error.message);
        else console.log(`[cal-webhook] Guidance annulée: ${bookingUid}`);
    }

    else if (trigger === 'BOOKING_RESCHEDULED') {
        const { error } = await supabase.from('guidances').update({ scheduled_at: scheduledAt, status: 'confirmed' }).eq('cal_booking_uid', bookingUid);
        if (error) console.error('[cal-webhook] Reschedule guidance:', error.message);
        else console.log(`[cal-webhook] Guidance reprogrammée: ${bookingUid}`);
    }

    return res.status(200).json({ received: true });
}

export default handler;

export const config = {
  api: { 
    bodyParser: false 
  }
};
