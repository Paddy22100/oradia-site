const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendBrevoEmail } = require('../lib/brevo-order-email.js');
const { sendToreSubscriptionEmail } = require('../lib/tore-subscription-email.js');
const { sendGuidanceConfirmationEmail } = require('../lib/guidance-email.js');

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
            // On répond quand même 200 pour éviter les relivraisons Stripe en boucle.
            // L'erreur est journalisée dans les logs Vercel.
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

// Retrouve la ligne `tore_subscriptions` correspondant à un événement Stripe
// d'abonnement/facture. Priorité aux identifiants Stripe stables
// (`stripe_subscription_id`, puis `stripe_customer_id`), stockés depuis la
// création de l'abonnement — bien plus fiables qu'une recherche par email
// (qui peut échouer si le client modifie son adresse côté Stripe). On garde
// la recherche par email en dernier recours pour les abonnements créés avant
// l'ajout de ces colonnes.
async function sendSubscriptionEmail(toEmail, toName, type) {
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr';
    if (!BREVO_API_KEY || !senderEmail) return;

    // 'payment_failed'        → échec sur un abonnement déjà actif (renouvellement mensuel)
    // 'payment_failed_first'  → échec du tout premier prélèvement d'un abonné qui a déjà un
    //                           compte existant (ex : réabonnement) — copie adaptée pour ne
    //                           pas parler de "renouvellement" à quelqu'un qui vient de s'inscrire
    // 'cancelled'              → abonnement annulé / expiré
    const isFirstPaymentFailed = type === 'payment_failed_first';
    const isPaimentFailed = type === 'payment_failed' || isFirstPaymentFailed;
    const subject = isFirstPaymentFailed
        ? "Rudy d'Oradia - Votre paiement n'a pas abouti — activer votre accès"
        : isPaimentFailed
        ? "Rudy d'Oradia - Votre paiement n'a pas abouti — renouveler votre accès"
        : "Rudy d'Oradia - Votre abonnement Le Tore est arrivé à échéance";
    const title = isPaimentFailed ? 'Paiement non abouti' : 'Votre accès a expiré';
    const subtitle = isFirstPaymentFailed
        ? 'Un problème est survenu lors de votre paiement'
        : isPaimentFailed
        ? 'Un problème est survenu lors du renouvellement'
        : 'Renouvelez votre abonnement pour continuer';
    const bodyText = isFirstPaymentFailed
        ? `Bonjour${toName ? ' ' + toName : ''},<br><br>Nous n'avons pas pu confirmer votre paiement pour l'abonnement <strong style="color:#f0c75e;">Le Tore</strong> — votre moyen de paiement n'a pas été accepté.<br><br>Nous retentons automatiquement le prélèvement dans les prochains jours. Vous pouvez aussi mettre à jour votre moyen de paiement dès maintenant depuis votre espace membre.`
        : isPaimentFailed
        ? `Bonjour${toName ? ' ' + toName : ''},<br><br>Nous n'avons pas pu renouveler votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> — votre moyen de paiement n'a pas été accepté.<br><br>Pour continuer à accéder à vos tirages, veuillez mettre à jour votre paiement.`
        : `Bonjour${toName ? ' ' + toName : ''},<br><br>Votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> est arrivé à échéance et votre accès a été suspendu.<br><br>Renouvelez votre abonnement pour retrouver votre espace et continuer vos tirages.`;

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}.h1{font-size:26px!important}.btn{padding:13px 20px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;" bgcolor="#050a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.png">
<tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;">
<table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">
<tr><td style="padding:0;line-height:0;font-size:0;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;"></td></tr>
<tr><td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
<h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">${title}</h1>
<table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
<p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">${subtitle}</p>
</td></tr>
<tr><td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;">${bodyText}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr><td style="border-radius:6px;" bgcolor="#d4af37">
<a href="https://oradia.fr/member/login.html?returnTo=abonnements.html%3FfromEmail%3D1" class="btn" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">Renouveler mon abonnement</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:0 24px 16px;" bgcolor="#0a1628">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(212,175,55,0.35);border-radius:14px;">
    <tr><td style="padding:0;line-height:0;font-size:0;">
      <img src="https://oradia.fr/images/medias/banniere-facebook.webp" alt="Oracle Oradia — Précommandes ouvertes" width="600" style="display:block;width:100%;height:auto;border:0;border-radius:14px 14px 0 0;">
    </td></tr>
    <tr><td style="background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06));padding:24px 32px;text-align:center;border-radius:0 0 14px 14px;">
      <p style="margin:0 0 6px;color:rgba(212,175,55,0.55);font-family:Georgia,serif;font-size:11px;letter-spacing:0.4em;text-transform:uppercase;">Précommandes ouvertes</p>
      <p style="margin:0 0 6px;color:#f0c75e;font-family:Georgia,serif;font-size:20px;font-weight:600;">L'Oracle Oradia</p>
      <p style="margin:0 0 16px;color:#c8c0a8;font-family:Georgia,serif;font-size:13px;line-height:1.6;">64 cartes · Livret · Conte initiatique · Pièce artisanale</p>
      <a href="https://oradia.fr/precommande-oracle.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a192f;text-decoration:none;padding:12px 32px;border-radius:50px;font-weight:700;font-size:13px;letter-spacing:0.05em;font-family:Georgia,serif;">Précommander</a>
    </td></tr>
  </table>
</td></tr>
<tr><td align="center" style="padding:36px 32px 28px;border-top:1px solid rgba(212,175,55,0.15);" bgcolor="#0a1628">
<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">Avec gratitude,</p>
<p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
<p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">Fondateur d'Oradia</p>
<p style="margin:0 0 12px;text-align:center;"><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4));vertical-align:middle;"></span><span style="display:inline-block;width:5px;height:5px;background:#d4af37;border-radius:50%;opacity:0.45;vertical-align:middle;margin:0 8px;"></span><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent);vertical-align:middle;"></span></p>
<a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.png" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.png" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`;

    await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sender: { email: senderEmail, name: "Rudy d'Oradia" },
            to: [{ email: toEmail, name: toName || undefined }],
            replyTo: { email: 'contact@oradia.fr', name: "Rudy d'Oradia" },
            subject,
            htmlContent: html,
            textContent: `${bodyText.replace(/<[^>]+>/g, '')} — Renouveler : https://oradia.fr/tore.html`
        })
    });
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

async function findToreSubscriptionRow(stripe, supabase, object) {
    const subscriptionId = getSubscriptionIdFromObject(object);
    const customerId = object?.customer
        ? (typeof object.customer === 'string' ? object.customer : object.customer.id)
        : null;

    if (subscriptionId) {
        const { data } = await supabase
            .from('tore_subscriptions')
            .select('id, email, is_free')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();
        if (data) return data;
    }

    if (customerId) {
        const { data } = await supabase
            .from('tore_subscriptions')
            .select('id, email, is_free')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
        if (data) return data;
    }

    const email = await resolveCustomerEmail(stripe, object);
    if (email) {
        const { data } = await supabase
            .from('tore_subscriptions')
            .select('id, email, is_free')
            .eq('email', email)
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
async function activateToreSubscription(supabase, { email, fullName, plan, stripeCustomerId, stripeSubscriptionId, amountTotalCents, sourceRef }) {
    if (!email) { console.error('[webhook] activateToreSubscription: email manquant'); return; }

    const { data: existingRow } = await supabase
        .from('tore_subscriptions')
        .select('id')
        .eq('email', email)
        .single();

    let tempPassword = null;
    let resetLink = null;

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
                must_change_password: true
            }
        });

        if (authError) {
            console.error('[webhook] Supabase Auth createUser error:', authError.message);
            // On ne sait pas si le mot de passe généré ici correspond réellement au
            // compte (ex: livraison en double du webhook, compte déjà créé par un
            // appel concurrent) — ne jamais envoyer un mot de passe qui pourrait être
            // faux. On propose à la place un lien de réinitialisation sécurisé.
            tempPassword = null;
            try {
                const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
                    type: 'recovery',
                    email,
                    options: { redirectTo: 'https://oradia.fr/member/reset-password.html' }
                });
                if (linkErr) console.error('[webhook] generateLink error:', linkErr.message);
                else resetLink = linkData?.properties?.action_link || null;
            } catch (e) {
                console.error('[webhook] generateLink exception:', e.message);
            }
        }
    }

    const accessCode = 'TORE-' + Date.now().toString(36).toUpperCase();
    const expireAt = new Date();
    expireAt.setMonth(expireAt.getMonth() + 1);

    const { error: subError } = await supabase
        .from('tore_subscriptions')
        .upsert({
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
        }, { onConflict: 'email' });

    if (subError) console.error('[webhook] tore_subscriptions upsert error:', subError.message);

    if (!isAccountingExcluded(email)) {
        await supabase.from('transactions').insert({
            date: new Date().toISOString().split('T')[0],
            type: 'recette',
            category: 'abonnement',
            description: `Abonnement Tore ${plan || 'complet'} — ${fullName || email}`,
            amount: (amountTotalCents || 0) / 100,
            source: 'abonnement',
            source_ref: sourceRef
        }).then(({ error }) => { if (error) console.error('[webhook] transactions insert (abonnement):', error.message); });
    }

    await supabase.from('newsletter_contacts').upsert({
        email,
        full_name: fullName || '',
        source:   'abonnement-tore',
        tags:     ['abonne-tore'],
        status:   'active',
        brevo_synced: false
    }, { onConflict: 'email', ignoreDuplicates: false }).catch(e =>
        console.error('[webhook] newsletter_contacts upsert:', e.message)
    );

    if (process.env.BREVO_API_KEY) {
        const nameParts = (fullName || '').trim().split(' ');
        await fetch('https://api.brevo.com/v3/contacts', {
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
        }).catch(e => console.error('[webhook] Brevo add to list 5:', e.message));
    }

    await sendToreSubscriptionEmail({
        toEmail:  email,
        toName:   fullName || '',
        tempPassword: existingRow ? null : tempPassword,
        resetLink,
        plan: plan || 'complet'
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
                const email = invoice.customer_email
                    || subscription?.metadata?.email
                    || await resolveCustomerEmail(stripe, invoice);

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
                    sourceRef: invoice.id
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
                console.error('[webhook] Échec prolongation abonnement Tore:', renewError.message);
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
                }).then(({ error }) => { if (error) console.error('[webhook] transactions insert (renouvellement):', error.message); });
            }
            break;
        }

        // ── Échec de prélèvement lors d'un renouvellement ───────────────────
        case 'invoice.payment_failed': {
            const stripe = getStripeClient();
            const supabase = getSupabaseClient();
            const invoice = event.data.object;
            if (!getSubscriptionIdFromObject(invoice)) break;

            const row = await findToreSubscriptionRow(stripe, supabase, invoice);
            if (!row || !row.email) break;

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
                console.error('[webhook] Échec mise à jour statut payment_failed:', failError.message);
            } else {
                console.log(`[webhook] Échec de paiement signalé pour l'abonnement Tore de ${row.email}`);
                sendSubscriptionEmail(row.email, row.full_name, isFirstPayment ? 'payment_failed_first' : 'payment_failed').catch(e => console.error('[webhook] Email échec paiement:', e.message));
            }
            break;
        }

        // ── Annulation d'abonnement ──────────────────────────────────────────
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
                console.error('[webhook] Échec mise à jour statut cancelled:', cancelError.message);
            } else {
                console.log(`[webhook] Abonnement Tore annulé pour ${row.email}`);
                sendSubscriptionEmail(row.email, row.full_name, 'cancelled').catch(e => console.error('[webhook] Email annulation:', e.message));
            }
            break;
        }

        case 'checkout.session.completed': {
                const stripe = getStripeClient();
                const supabase = getSupabaseClient();
                const session = event.data.object;
                const sessionId = session.id;

                console.log(`Session completed: ${sessionId}`);
                
                // Extraction robuste des données avec fallbacks
                const extractedData = {
                    // Email avec fallbacks multiples
                    email: session.customer_details?.email || 
                           session.customer_email || 
                           session.metadata?.email || 
                           null,
                    
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
                        sourceRef: sessionId
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
                        // La réponse HTTP a déjà été envoyée à Stripe (200 immédiat,
                        // traitement en fire-and-forget) : on ne peut plus renvoyer
                        // d'erreur HTTP ici. On journalise et on arrête ce traitement.
                        console.error('[webhook] Insertion donors échouée:', donorError.message);
                        return;
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
                    }).then(({ error }) => { if (error) console.error('[webhook] transactions insert (don):', error.message); });
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
                    console.error('[webhook] Lecture preorders échouée:', existingOrderError.message);
                    return;
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
                    console.error('[webhook] Upsert Supabase échoué:', upsertError.message);
                    return;
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
                        invoiceUrl: invoiceUrl
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
                    category: 'précommande',
                    description: `Précommande ${upsertData.offer || ''} — ${upsertData.full_name || upsertData.email || ''}`,
                    amount: parseFloat(upsertData.amount_total) || 0,
                    source: 'precommande',
                    source_ref: sessionId
                }).then(({ error }) => { if (error) console.error('[webhook] transactions insert (precommande):', error.message); });
                }

                console.log(`[webhook] Précommande traitée: ${sessionId} | DB:OK | Email:${emailSent ? 'OK' : 'Skipped'}`);
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
        }).then(({ error }) => { if (error) console.error('[webhook] transactions insert (guidance):', error.message); });
        }

        const dateStr = scheduledAt
            ? new Date(scheduledAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' })
            : '—';

        if (clientEmail) {
            await sendGuidanceConfirmationEmail({ clientEmail, clientName, duration, dateStr, jitsiUrl })
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
