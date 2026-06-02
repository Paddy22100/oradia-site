const { createClient } = require('@supabase/supabase-js');

// Fonctions pour créer les clients après validation environnement
function getStripeClient() {
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

function getSupabaseClient() {
    // URL Supabase du projet oradia-prod (nxxetkdozynuytlbhxdx)
    const supabaseUrl = 'https://nxxetkdozynuytlbhxdx.supabase.co';
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

// Fonction d'envoi d'email Brevo
async function sendBrevoEmail({ toEmail, toName, offer, amountTotal, invoiceUrl = null }) {
    try {
        // Validation silencieuse des variables d'environnement
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }
        
        // Différencier don vs précommande
        const isDonation = offer === 'contribution-libre';
        const subject = isDonation
            ? 'Merci pour ton soutien à ORADIA'
            : 'Ta précommande ORADIA est confirmée';
        
        // Section facture PDF (seulement pour les précommandes avec facture)
        const invoiceSection = (!isDonation && invoiceUrl) ? `
              <!-- Téléchargement facture -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:4px;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 12px 0;color:#d4af37;font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;text-transform:uppercase;letter-spacing:1px;">
                      📄 Votre facture est disponible
                    </p>
                    <a href="${invoiceUrl}" style="display:inline-block;background:#d4af37;color:#0a1628;font-family:'Lora',Georgia,serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:4px;letter-spacing:0.5px;">
                      Télécharger la facture PDF
                    </a>
                  </td>
                </tr>
              </table>
        ` : '';
        
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME || 'ORADIA'
                },
                to: [{
                    email: toEmail,
                    name: toName
                }],
                replyTo: {
                    email: "contact@oradia.fr",
                    name: "Oradia"
                },
                subject: subject,
                htmlContent: `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#050a14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        
        <!-- Container principal -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(135deg, #0a1628 0%, #051428 100%);border:1px solid rgba(212,175,55,0.3);border-radius:0;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          
          <!-- Header avec image -->
          <tr>
            <td align="center" style="padding:0;position:relative;">
              <div style="position:relative;width:100%;height:240px;overflow:hidden;">
                <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" style="display:block;width:100%;height:240px;object-fit:cover;border:0;opacity:0.85;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg, rgba(5,10,20,0) 0%, rgba(5,10,20,0.95) 100%);"></div>
              </div>
            </td>
          </tr>

          <!-- Titre principal -->
          <tr>
            <td align="center" style="padding:32px 40px 24px 40px;">
              <h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">
                ${isDonation ? 'Gratitude' : 'Confirmation'}
              </h1>
              <div style="width:60px;height:1px;background:linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);margin:20px auto;"></div>
              <p style="margin:0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:15px;font-style:italic;line-height:1.6;letter-spacing:0.5px;">
                ${isDonation ? 'Merci pour ton soutien précieux' : 'Ta précommande est bien enregistrée'}
              </p>
            </td>
          </tr>

          <!-- Corps du message -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              
              <p style="margin:0 0 24px 0;color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">
                ${toName ? toName + ',' : 'Cher(e) ami(e),'}
              </p>

              <p style="margin:0 0 28px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                ${isDonation 
                    ? 'Avec une profonde gratitude, nous te remercions pour ton soutien à ORADIA. Ta contribution nous aide à partager la sagesse de l\'Oracle avec celles et ceux qui en ont besoin.'
                    : 'C\'est avec joie que nous confirmons ta précommande. Ton Oracle sera façonné avec soin dès le lancement de la production. Tu fais partie des premiers à rejoindre cette aventure.'
                }
              </p>

              <!-- Encadré détails -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;background:rgba(17,24,43,0.6);border-left:3px solid #d4af37;backdrop-filter:blur(10px);">
                <tr>
                  <td style="padding:24px 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0 0 12px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                          ${isDonation ? 'Contribution' : 'Offre sélectionnée'}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 20px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;line-height:1.3;">
                          ${offer}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 0 0 0;border-top:1px solid rgba(212,175,55,0.2);color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:18px;font-weight:600;">
                          ${amountTotal} €
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${invoiceSection}

              <p style="margin:32px 0 0 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                ${isDonation 
                    ? 'Ton soutien nous permet de poursuivre notre mission d\'accompagnement des âmes en quête de sens et de transformation.'
                    : 'Nous te tiendrons informé(e) de l\'avancement de la production et te recontacterons personnellement dès que ton Oracle sera prêt à rejoindre ton chemin.'
                }
              </p>

            </td>
          </tr>

          <!-- Séparateur décoratif -->
          <tr>
            <td align="center" style="padding:0 40px;">
              <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.3) 50%, transparent 100%);"></div>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td align="center" style="padding:40px 40px 48px 40px;">
              <p style="margin:0 0 8px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;letter-spacing:0.5px;">
                Avec toute ma gratitude,
              </p>
              <p style="margin:0 0 4px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;letter-spacing:1px;">
                Rudy
              </p>
              <p style="margin:0 0 24px 0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;">
                Fondateur d'ORADIA
              </p>
              <a href="https://oradia.fr" style="display:inline-block;color:#d4af37;text-decoration:none;font-family:'Lora',Georgia,serif;font-size:13px;letter-spacing:1px;border-bottom:1px solid rgba(212,175,55,0.4);padding-bottom:2px;transition:all 0.3s ease;">
                oradia.fr
              </a>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`,
                textContent: `${isDonation 
    ? `Merci pour ton soutien à ORADIA

Bonjour${toName ? ' ' + toName : ''},

Avec profonde gratitude, nous vous remercions pour votre soutien à ORADIA. Votre contribution nous aide à partager la sagesse de l'Oracle avec plus de personnes.

Contribution : ${offer}
Montant : ${amountTotal}€

Ton soutien précieux nous permet de continuer notre mission d'accompagner les âmes sur leur chemin de transformation.

Merci du fond du cœur pour ta générosité et ta confiance en notre vision.

Avec toute notre gratitude,
Rudy
Fondateur d'ORADIA
oradia.fr`
    : `Ta précommande ORADIA est confirmée

Bonjour${toName ? ' ' + toName : ''},

C'est avec joie que nous confirmons ta précommande. Ton Oracle sera façonné avec soin dès le lancement de la production. Tu fais partie des premiers à rejoindre cette aventure.

Offre choisie : ${offer}
Montant : ${amountTotal}€

Nous te tiendrons informé(e) de l'avancement de la production et te recontacterons personnellement dès que ton Oracle sera prêt à rejoindre ton chemin.

Merci pour ta confiance et pour accueillir la sagesse d'ORADIA dans ta vie.

Avec toute ma gratitude,
Rudy
Fondateur d'ORADIA
oradia.fr`
}`
            })
        });

        if (!response.ok) {
            console.error(`Brevo API error: ${response.status}`);
            return false;
        }

        console.log('Email sent via Brevo');
        return true;

    } catch (error) {
        console.error('Failed to send email via Brevo:', error.message);
        return false; // Ne jamais faire planter le webhook
    }
}

async function sendToreSubscriptionEmail({ toEmail, toName, tempPassword }) {
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
                subject:   '✦ Bienvenue dans Le Tore — Votre abonnement est actif',
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
    try {
        validateEnvironment();

        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
            // Lire le body brut depuis la requête
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const rawBody = Buffer.concat(chunks);
            
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
        
        switch (event.type) {
            case 'checkout.session.completed': {
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
                    const supabase = getSupabaseClient();

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
                    const { error: subError } = await supabase
                        .from('tore_subscriptions')
                        .upsert({
                            email:        extractedData.email,
                            full_name:    extractedData.full_name || '',
                            access_code:  accessCode,
                            status:       'active',
                            created_at:   new Date().toISOString(),
                            updated_at:   new Date().toISOString()
                        }, { onConflict: 'email' });

                    if (subError) console.error('tore_subscriptions upsert error:', subError.message);

                    // Email Brevo de confirmation d'abonnement avec mot de passe temporaire
                    if (extractedData.email) {
                        await sendToreSubscriptionEmail({
                            toEmail:    extractedData.email,
                            toName:     extractedData.full_name || '',
                            tempPassword: existingUsers ? null : tempPassword // Envoyer le mot de passe si nouvel utilisateur
                        });
                    }

                    return res.status(200).json({ success: true, message: 'Tore subscription processed', sessionId });
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
                        console.error('Insertion donors échouée:', donorError.message);
                        return res.status(500).json({
                            success: false,
                            error: 'Database error',
                            message: 'Une erreur est survenue lors du traitement'
                        });
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
                    
                    return res.status(200).json({
                        success: true,
                        message: 'Don processed successfully',
                        sessionId: sessionId,
                        destination: 'donors',
                        emailStatus: emailSent ? 'sent' : 'skipped'
                    });
                }

                // Validation des champs obligatoires pour précommandes
                if (!extractedData.offer) {
                    console.error('Offer manquant - impossible de continuer');
                    return res.status(400).json({ 
                        success: false,
                        error: 'Invalid request',
                        message: 'Offre requise pour le traitement'
                    });
                }

                // Lire la commande existante pour fusionner avec les données Stripe
                const { data: existingOrder, error: existingOrderError } = await supabase
                    .from('preorders')
                    .select('*')
                    .eq('stripe_session_id', sessionId)
                    .maybeSingle();

                if (existingOrderError) {
                    console.error('Lecture preorders échouée:', existingOrderError.message);
                    return res.status(500).json({
                        success: false,
                        error: 'Database error',
                        message: 'Une erreur est survenue lors du traitement'
                    });
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
                    console.error('Upsert Supabase échoué:', upsertError.message);
                    return res.status(500).json({
                        success: false,
                        error: 'Database error',
                        message: 'Une erreur est survenue lors du traitement'
                    });
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
                
                console.log(`Webhook traité: ${sessionId} | DB:OK | Email:${emailSent ? 'OK' : 'Skipped'}`);
                
                return res.status(200).json({ 
                    success: true,
                    message: 'Order processed successfully',
                    sessionId: sessionId,
                    emailStatus: emailSent ? 'sent' : 'skipped'
                });
            }
            
            default:
                console.log(`Event not handled: ${event.type}`);
                return res.status(200).json({ 
                    success: true,
                    message: 'Event received but not handled' 
                });
        }
    } catch (error) {
        console.error('Webhook processing error:', error.message);
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error', 
            message: 'Une erreur est survenue lors du traitement'
        });
    }
};

module.exports = handler;
