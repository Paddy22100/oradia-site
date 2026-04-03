const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Variables d'environnement avec fallbacks
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// AUDIT: Logs des variables d'environnement critiques
console.log('🔍 AUDIT VARIABLES ENVIRONNEMENT:');
console.log('  - STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ Configurée' : '❌ Manquante');
console.log('  - STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? '✅ Configurée' : '❌ Manquante');
console.log('  - SUPABASE_URL:', supabaseUrl || '❌ Manquante');
console.log('  - NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || '❌ Manquante');
console.log('  - SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ Configurée' : '❌ Manquante');

// Création directe du client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Fonction d'envoi d'email Brevo
async function sendBrevoEmail({ toEmail, toName, offer, amountTotal }) {
    try {
        // Logs de diagnostic pour les variables d'environnement
        if (!process.env.BREVO_API_KEY) {
            console.error('❌ BREVO_API_KEY manquante');
            return false;
        }
        
        if (!process.env.BREVO_SENDER_EMAIL) {
            console.error('❌ BREVO_SENDER_EMAIL manquant');
            return false;
        }
        
        // Différencier don vs précommande
        const isDonation = offer === 'contribution-libre';
        const subject = isDonation
            ? 'Merci pour ton soutien à ORADIA'
            : 'Ta précommande ORADIA est confirmée';
        
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME
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
<div style="margin:0;padding:0;background-color:#0b1020;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b1020;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background-color:#11182b;border:1px solid #c9a94d;border-radius:16px;overflow:hidden;">
          
          <tr>
            <td align="center" style="padding:32px 24px 16px 24px;background:linear-gradient(180deg,#11182b 0%,#16203a 100%);">
              <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="ORADIA" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;margin:0 auto 20px auto;">
              <h1 style="margin:0;color:#d4af37;font-family:Georgia,serif;font-size:30px;line-height:1.2;">ORADIA</h1>
              <p style="margin:8px 0 0 0;color:#d8bf72;font-family:Georgia,serif;font-size:16px;line-height:1.5;font-style:italic;">
                L'Oracle de ton Âme
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 30px 20px 30px;font-family:Georgia,serif;color:#f3f4f6;">
              <h2 style="margin:0 0 22px 0;color:#f0c75e;font-size:28px;line-height:1.3;text-align:center;">
                ${isDonation ? '✨ Merci pour ton soutien' : '✨ Ta précommande est confirmée'}
              </h2>

              <p style="margin:0 0 18px 0;font-size:18px;line-height:1.7;color:#ffffff;">
                Bonjour${toName ? ' ' + toName : ''},
              </p>

              <p style="margin:0 0 18px 0;font-size:17px;line-height:1.8;color:#e5e7eb;">
                ${isDonation 
                    ? 'Avec profonde gratitude, nous te remercions pour ton soutien à ORADIA. Ta contribution nous aide à partager la sagesse de l\'Oracle avec plus de personnes.'
                    : 'Avec gratitude, nous te confirmons que ta précommande ORADIA a bien été enregistrée.'
                }
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;background-color:#1c2438;border:1px solid #c9a94d;border-radius:10px;">
                <tr>
                  <td style="padding:18px 20px;font-family:Georgia,serif;color:#f0c75e;font-size:16px;line-height:1.8;">
                    <strong>${isDonation ? 'Contribution' : 'Offre'} :</strong> ${offer}<br>
                    <strong>Montant :</strong> ${amountTotal}€
                  </td>
                </tr>
              </table>

              ${isDonation 
                ? `<p style="margin:0 0 18px 0;font-size:17px;line-height:1.8;color:#e5e7eb;">
                    Ton soutien précieux nous permet de continuer notre mission d'accompagner les âmes sur leur chemin de transformation.
                  </p>`
                : `<p style="margin:0 0 18px 0;font-size:17px;line-height:1.8;color:#e5e7eb;">
                    Ton oracle est maintenant en préparation. Nous te recontacterons personnellement dès qu'il sera prêt.
                  </p>`
              }

              <p style="margin:0 0 12px 0;font-size:17px;line-height:1.8;color:#e5e7eb;">
                ${isDonation 
                    ? 'Merci du fond du cœur pour ta générosité et ta confiance en notre vision.'
                    : 'Merci pour ta confiance et pour accueillir la sagesse d\'ORADIA dans ta vie.'
                }
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:26px 24px 34px 24px;border-top:1px solid rgba(212,175,55,0.25);background-color:#101728;">
              <p style="margin:0 0 8px 0;color:#d8bf72;font-family:Georgia,serif;font-size:15px;line-height:1.6;">
                Avec toute notre gratitude
              </p>
              <p style="margin:0;color:#d4af37;font-family:Georgia,serif;font-size:24px;line-height:1.3;font-weight:bold;">
                Rudy
              </p>
              <p style="margin:8px 0 14px 0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;line-height:1.5;font-style:italic;">
                Fondateur d'ORADIA
              </p>
              <p style="margin:0;">
                <a href="https://oradia.fr" style="color:#f0c75e;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;">
                  oradia.fr
                </a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</div>
`,
                textContent: `${isDonation 
    ? `Merci pour ton soutien à ORADIA

Bonjour${toName ? ' ' + toName : ''},

Avec profonde gratitude, nous te remercions pour ton soutien à ORADIA. Ta contribution nous aide à partager la sagesse de l'Oracle avec plus de personnes.

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

Avec une immense gratitude, nous te confirmons que ta précommande ORADIA a bien été enregistrée avec succès.

Offre choisie : ${offer}
Montant : ${amountTotal}€

Ton oracle est maintenant en préparation. Nous te recontacterons personnellement dès qu'il sera prêt à t'accompagner dans ton voyage intérieur.

Merci pour ta confiance et pour choisir d'accueillir la sagesse d'ORADIA dans ta vie.

Avec toute notre gratitude,
Rudy
Fondateur d'ORADIA
oradia.fr`
}`
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Brevo API error: ${response.status}`);
            return false;
        }

        const result = await response.json();
        console.log('✅ Email sent via Brevo');
        return true;

    } catch (error) {
        console.error('❌ Failed to send email via Brevo:', error.message);
        console.error('❌ Full error:', error);
        return false; // Ne jamais faire planter le webhook
    }
}

const handler = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
        console.error('❌ Missing webhook signature or secret');
        return res.status(400).json({ error: 'Missing signature' });
    }

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
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
        console.log(`🎯 Webhook event: ${event.type}`);
        
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const sessionId = session.id;
                
                console.log(`🛒 Session completed: ${sessionId}`);
                
                // Extraction robuste des données avec fallbacks
                const extractedData = {
                    // Email avec fallbacks multiples
                    email: session.customer_details?.email || 
                           session.customer_email || 
                           session.metadata?.email || 
                           null,
                    
                    // Offer depuis metadata (obligatoire)
                    offer: session.metadata?.offer || (() => {
                        try {
                            const items = JSON.parse(session.metadata?.items || '[]');
                            return items[0]?.offer || null;
                        } catch {
                            return null;
                        }
                    })(),
                    
                    // Nom complet avec fallbacks
                    full_name: session.metadata?.full_name || 
                              session.customer_details?.name || 
                              null,
                    
                    // Adresse avec fallbacks metadata prioritaire
                    shipping_address: session.metadata?.shipping_address || 
                                    session.customer_details?.address?.line1 || 
                                    null,
                    
                    // Code postal avec fallbacks
                    postal_code: session.metadata?.postal_code || 
                                 session.customer_details?.address?.postal_code || 
                                 null,
                    
                    // Ville avec fallbacks
                    city: session.metadata?.city || 
                          session.customer_details?.address?.city || 
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
                    paid_status: 'completed'
                };

                // Validation des champs obligatoires
                if (!extractedData.email) {
                    console.error('❌ Email manquant - envoi d\'email annulé mais webhook continue');
                    // Continuer le traitement sans envoyer d'email
                }

                // Gestion spéciale pour les contributions libres
                if (extractedData.offer === 'contribution-libre') {
                    const amountInEuros = extractedData.amount_total / 100;
                    
                    const donorData = {
                        stripe_session_id: extractedData.stripe_session_id,
                        payment_intent_id: extractedData.payment_intent_id,
                        email: extractedData.email,
                        full_name: extractedData.full_name || 'Soutien ORADIA',
                        amount_total: amountInEuros,
                        currency: extractedData.currency,
                        paid_status: 'completed',
                        source: 'oradia-contribution'
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
                        console.error('❌ Insertion donors échouée:', donorError.message);
                        return res.status(500).json({
                            error: 'Failed to process donation',
                            message: donorError.message
                        });
                    }
                    
                    // Vérifier si email déjà envoyé
                    let emailSent = false;
                    if (extractedData.email && !donorResult.email_sent_at) {
                        emailSent = await sendBrevoEmail({
                            toEmail: extractedData.email,
                            toName: extractedData.full_name || 'Ami(e) d\'ORADIA',
                            offer: extractedData.offer,
                            amountTotal: (extractedData.amount_total / 100).toFixed(2)
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
                    console.error('❌ Offer manquant - impossible de continuer');
                    return res.status(400).json({ 
                        error: 'Missing required field: offer',
                        message: 'Offer is required for preorder processing'
                    });
                }

                const supabaseData = {
                    stripe_session_id: extractedData.stripe_session_id,
                    email: extractedData.email,
                    offer: extractedData.offer,
                    full_name: extractedData.full_name || 'Client ORADIA',
                    amount_total: extractedData.amount_total / 100,
                    currency: extractedData.currency,
                    payment_intent_id: extractedData.payment_intent_id,
                    paid_status: extractedData.paid_status,
                    shipping_address: extractedData.shipping_address,
                    postal_code: extractedData.postal_code,
                    city: extractedData.city,
                    phone: extractedData.phone,
                    updated_at: new Date().toISOString()
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
                    console.error('❌ Upsert Supabase échoué:', upsertError.message);
                    return res.status(500).json({
                        error: 'Database operation failed',
                        message: upsertError.message
                    });
                }

                // Vérifier si email déjà envoyé
                let emailSent = false;
                if (extractedData.email && !upsertData.email_sent_at) {
                    emailSent = await sendBrevoEmail({
                        toEmail: extractedData.email,
                        toName: extractedData.full_name || 'Ami(e) d\'ORADIA',
                        offer: extractedData.offer,
                        amountTotal: (extractedData.amount_total / 100).toFixed(2)
                    });
                    
                    if (emailSent) {
                        await supabase
                            .from('preorders')
                            .update({ email_sent_at: new Date().toISOString() })
                            .eq('stripe_session_id', sessionId);
                    }
                }
                
                console.log(`✅ Webhook traité: ${sessionId} | DB:OK | Email:${emailSent ? 'OK' : 'Skipped'}`);
                
                return res.status(200).json({ 
                    message: 'Order processed successfully',
                    sessionId: sessionId,
                    emailStatus: emailSent ? 'sent' : 'skipped'
                });
            }
            
            default:
                console.log(`Event not handled: ${event.type}`);
                return res.status(200).json({ message: 'Event received but not handled' });
        }
    } catch (error) {
        console.error('❌ Webhook processing error:', error.message);
        return res.status(500).json({ 
            error: 'Processing error', 
            message: error.message 
        });
    }
};

module.exports = handler;
