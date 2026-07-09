const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendBrevoEmail } = require('../lib/brevo-order-email.js');

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

async function sendToreSubscriptionEmail({ toEmail, toName, tempPassword, plan }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return false;
        
        // Section mot de passe (uniquement pour nouveaux utilisateurs)
        const passwordSection = tempPassword ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.12);border:2px solid rgba(212,175,55,0.5);border-radius:4px;margin-bottom:28px;">
            <tr><td align="center" style="padding:28px;">
              <p style="margin:0 0 12px;color:rgba(212,175,55,0.7);font-family:'Lora',Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Votre mot de passe temporaire</p>
              <p style="margin:0;color:#f0c75e;font-family:'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:0.2em;padding:12px 20px;background:rgba(0,0,0,0.3);border-radius:4px;">${tempPassword}</p>
              <p style="margin:12px 0 0;color:rgba(212,175,55,0.5);font-family:'Lora',Georgia,serif;font-size:12px;">Vous pourrez le modifier dans votre espace membre</p>
            </td></tr>
          </table>
        ` : `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.08);border:1.5px solid rgba(212,175,55,0.4);border-radius:4px;margin-bottom:28px;">
            <tr><td align="center" style="padding:28px;">
              <p style="margin:0 0 10px;color:rgba(212,175,55,0.6);font-family:'Lora',Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Vos accès</p>
              <p style="margin:0;color:#f0c75e;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.6;">
                Connectez-vous avec votre email et votre mot de passe
              </p>
            </td></tr>
          </table>
        `;
        
        const textPassword = tempPassword ? 
            `\nVotre mot de passe temporaire : ${tempPassword}\nVous pourrez le modifier dans votre espace membre.\n` : 
            `\nConnectez-vous avec votre email et votre mot de passe.\n`;
        
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender:    { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to:        [{ email: toEmail, name: toName }],
                replyTo:   { email: 'contact@oradia.fr', name: 'Oradia' },
                subject:   plan === 'decouverte'
                    ? "Rudy d'Oradia - Bienvenue dans Le Tore — Formule Découverte activée"
                    : "Rudy d'Oradia - Bienvenue dans Le Tore — Votre abonnement est actif",
                htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#050a14;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050a14;padding:48px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:linear-gradient(135deg,#0a1628,#051428);border:1px solid rgba(212,175,55,0.3);border-radius:4px;">
        <tr><td align="center" style="padding:48px 40px 24px;">
          <p style="margin:0 0 6px;color:rgba(212,175,55,0.5);font-family:'Lora',Georgia,serif;font-size:11px;letter-spacing:0.45em;text-transform:uppercase;">Abonnement activé</p>
          <h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:38px;font-weight:300;letter-spacing:2px;">Le Tore</h1>
          <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:20px auto;"></div>
        </td></tr>
        <tr><td style="padding:0 40px 32px;">
          <p style="color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">${toName ? toName + ',' : 'Bienvenue,'}</p>
          <p style="color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;margin-bottom:32px;">Votre abonnement au Tore est maintenant actif. Vous avez accès illimité à l'expérience complète d'Oradia.</p>
          
          ${passwordSection}
          
          <p style="color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:14px;line-height:1.8;margin-bottom:24px;">
            <strong style="color:#f0c75e;">Accès direct :</strong> Rendez-vous sur la page Tore et connectez-vous à votre espace membre pour commencer votre exploration.
          </p>
          
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
            <tr><td align="center">
              <a href="https://oradia.fr/tore.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a1628;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-weight:600;text-decoration:none;padding:16px 40px;border-radius:50px;letter-spacing:0.5px;">
                Accéder au Tore
              </a>
            </td></tr>
          </table>
          
          <p style="color:rgba(212,175,55,0.6);font-family:'Lora',Georgia,serif;font-size:13px;line-height:1.6;margin-top:24px;">
            Votre abonnement se renouvelle automatiquement chaque mois. Vous pouvez le gérer à tout moment depuis votre espace membre.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:24px 40px 48px;border-top:1px solid rgba(212,175,55,0.1);">
          <p style="margin:0 0 4px;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;">Rudy</p>
          <p style="margin:0;color:rgba(212,175,55,0.4);font-family:'Lora',Georgia,serif;font-size:12px;font-style:italic;">Fondateur d'ORADIA</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
                textContent: `Bienvenue dans Le Tore\n\nVotre abonnement est maintenant actif.${textPassword}\nAccéder au Tore : https://oradia.fr/tore.html\n\nVotre abonnement se renouvelle automatiquement chaque mois.\n\nOradia — oradia.fr`
            })
        });
        return response.ok;
    } catch(e) { console.error('sendToreSubscriptionEmail error:', e.message); return false; }
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
async function findToreSubscriptionRow(stripe, supabase, object) {
    const subscriptionId =
        object?.subscription ||
        (object?.object === 'subscription' ? object.id : null) ||
        null;
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

            // Ne traiter que les factures de renouvellement d'abonnement
            // (la toute première facture est déjà gérée via checkout.session.completed)
            const isSubscriptionInvoice = !!invoice.subscription;
            if (!isSubscriptionInvoice) break;
            if (invoice.billing_reason === 'subscription_create') break;

            const row = await findToreSubscriptionRow(stripe, supabase, invoice);
            if (!row || !row.email) {
                console.error('[webhook] invoice.payment_succeeded : abonnement introuvable, sub:', invoice.subscription);
                break;
            }

            const newExpireAt = new Date();
            newExpireAt.setMonth(newExpireAt.getMonth() + 1);

            const { error: renewError } = await supabase
                .from('tore_subscriptions')
                .update({
                    status: 'active',
                    expires_at: newExpireAt.toISOString(),
                    stripe_subscription_id: invoice.subscription || null,
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
            if (!invoice.subscription) break;

            const row = await findToreSubscriptionRow(stripe, supabase, invoice);
            if (!row || !row.email) break;

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

                    // 1. Créer ou mettre à jour l'utilisateur dans Supabase Auth
                    const tempPassword = crypto.randomBytes(8).toString('hex'); // Mot de passe temporaire
                    
                    // Vérifier si l'utilisateur existe déjà
                    const { data: existingUsers } = await supabase
                        .from('tore_subscriptions')
                        .select('id')
                        .eq('email', extractedData.email)
                        .single();

                    if (!existingUsers) {
                        // Créer l'utilisateur dans Supabase Auth
                        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                            email: extractedData.email,
                            password: tempPassword,
                            email_confirm: true,
                            user_metadata: {
                                full_name: extractedData.full_name || '',
                                subscription_type: 'tore',
                                subscription_active: true
                            }
                        });

                        if (authError) {
                            console.error('Supabase Auth user creation error:', authError.message);
                        } else {
                            console.log('Supabase Auth user created:', authUser.user.id);
                        }
                    }

                    // 2. Enregistrer l'abonnement dans la table
                    const accessCode = 'TORE-' + Date.now().toString(36).toUpperCase();
                    // Calculer la date d'expiration (1 mois après aujourd'hui)
                    const expireAt = new Date();
                    expireAt.setMonth(expireAt.getMonth() + 1);
                    
                    const subPlan = session.metadata?.plan || 'complet';

                    const { error: subError } = await supabase
                        .from('tore_subscriptions')
                        .upsert({
                            email:        extractedData.email,
                            full_name:    extractedData.full_name || '',
                            access_code:  accessCode,
                            status:       'active',
                            expires_at:   expireAt.toISOString(),
                            plan:         subPlan,
                            // Identifiants Stripe stockés pour fiabiliser la corrélation lors
                            // des renouvellements/annulations (plus robuste qu'une recherche
                            // par email, qui peut échouer si le client change d'adresse côté Stripe)
                            stripe_customer_id:     session.customer || null,
                            stripe_subscription_id: session.subscription || null,
                            created_at:   new Date().toISOString(),
                            updated_at:   new Date().toISOString()
                        }, { onConflict: 'email' });

                    if (subError) console.error('tore_subscriptions upsert error:', subError.message);

                    // Enregistrement automatique de la recette (souscription initiale)
                    if (!isAccountingExcluded(extractedData.email)) {
                    await supabase.from('transactions').insert({
                        date: new Date().toISOString().split('T')[0],
                        type: 'recette',
                        category: 'abonnement',
                        description: `Abonnement Tore ${subPlan} — ${extractedData.full_name || extractedData.email}`,
                        amount: (extractedData.amount_total || 0) / 100,
                        source: 'abonnement',
                        source_ref: sessionId
                    }).then(({ error }) => { if (error) console.error('[webhook] transactions insert (abonnement):', error.message); });
                    }

                    // 3. Ajouter aux contacts newsletter (Supabase + Brevo list 5)
                    if (extractedData.email) {
                        await supabase.from('newsletter_contacts').upsert({
                            email:    extractedData.email,
                            full_name: extractedData.full_name || '',
                            source:   'abonnement-tore',
                            tags:     ['abonne-tore'],
                            status:   'active',
                            brevo_synced: false
                        }, { onConflict: 'email', ignoreDuplicates: false }).catch(e =>
                            console.error('[webhook] newsletter_contacts upsert:', e.message)
                        );

                        if (process.env.BREVO_API_KEY) {
                            const nameParts = (extractedData.full_name || '').trim().split(' ');
                            await fetch('https://api.brevo.com/v3/contacts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
                                body: JSON.stringify({
                                    email: extractedData.email,
                                    attributes: {
                                        PRENOM: nameParts[0] || '',
                                        NOM:    nameParts.slice(1).join(' ') || ''
                                    },
                                    listIds: [5],
                                    updateEnabled: true
                                })
                            }).catch(e => console.error('[webhook] Brevo add to list 5:', e.message));
                        }
                    }

                    // Email Brevo de confirmation d'abonnement avec mot de passe temporaire
                    if (extractedData.email) {
                        await sendToreSubscriptionEmail({
                            toEmail:      extractedData.email,
                            toName:       extractedData.full_name || '',
                            tempPassword: existingUsers ? null : tempPassword,
                            plan:         subPlan
                        });
                    }

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

        if (clientEmail && process.env.BREVO_API_KEY) {
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
                body: JSON.stringify({
                    sender: { email: process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr', name: 'Rudy · Oradia' },
                    to: [{ email: clientEmail, name: clientName }],
                    replyTo: { email: 'contact@oradia.fr', name: 'Rudy · Oradia' },
                    subject: `Rudy d'Oradia - Votre lien de connexion — Guidance Oradia du ${dateStr}`,
                    htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#050a14;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050a14;padding:48px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:linear-gradient(135deg,#0a1628,#051428);border:1px solid rgba(212,175,55,0.3);border-radius:4px;">
        <tr><td align="center" style="padding:48px 40px 24px;">
          <p style="margin:0 0 6px;color:rgba(212,175,55,0.5);font-family:Georgia,serif;font-size:11px;letter-spacing:0.45em;text-transform:uppercase;">Guidance par visio</p>
          <h1 style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:36px;font-weight:300;letter-spacing:2px;">ORADIA</h1>
          <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:20px auto;"></div>
        </td></tr>
        <tr><td style="padding:0 40px 32px;">
          <p style="color:#e8e9eb;font-family:Georgia,serif;font-size:16px;line-height:1.8;">${clientName ? clientName + ',' : 'Bonjour,'}</p>
          <p style="color:rgba(200,192,168,0.55);font-family:Georgia,serif;font-size:13px;line-height:1.7;font-style:italic;margin-bottom:16px;">Vous avez reçu un email de confirmation de Cal.com avec l'invitation calendrier. Cet email contient votre lien personnel pour rejoindre la visio.</p>
          <p style="color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.9;">Votre guidance de <strong style="color:#f0c75e;">${duration} minutes</strong> est prévue le <strong style="color:#f0c75e;">${dateStr}</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:4px;margin:24px 0;">
            <tr><td style="padding:24px;">
              <p style="margin:0 0 8px;color:rgba(212,175,55,0.6);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Date &amp; heure</p>
              <p style="margin:0 0 20px;color:#f0c75e;font-family:Georgia,serif;font-size:17px;">${dateStr}</p>
              <p style="margin:0 0 8px;color:rgba(212,175,55,0.6);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Lien de connexion</p>
              <a href="${jitsiUrl}" style="color:#f0c75e;font-family:Georgia,serif;font-size:14px;word-break:break-all;">${jitsiUrl}</a>
            </td></tr>
          </table>
          <p style="color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;">Cliquez sur le lien au moment du rendez-vous pour rejoindre la visio. Aucune installation requise.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
            <tr><td align="center">
              <a href="${jitsiUrl}" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a1628;font-family:Georgia,serif;font-size:16px;font-weight:600;text-decoration:none;padding:16px 40px;border-radius:50px;">Rejoindre la visio</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 40px 48px;border-top:1px solid rgba(212,175,55,0.1);">
          <p style="margin:0 0 4px;color:#f0c75e;font-family:Georgia,serif;font-size:26px;">Rudy</p>
          <p style="margin:0;color:rgba(212,175,55,0.4);font-family:Georgia,serif;font-size:12px;font-style:italic;">Fondateur d'ORADIA</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
                    textContent: `Guidance Oradia confirmée\n\nDate : ${dateStr}\nDurée : ${duration} minutes\nLien Jitsi : ${jitsiUrl}\n\nCliquez sur le lien au moment du rendez-vous.\n\nOradia — oradia.fr`
                })
            }).catch(e => console.error('[cal-webhook] Email client:', e.message));
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
