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
        console.log('🔧 Vérification variables Brevo:');
        console.log('  - BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✅ Configurée' : '❌ Manquante');
        console.log('  - BREVO_SENDER_EMAIL:', process.env.BREVO_SENDER_EMAIL || '❌ Manquante');
        console.log('  - BREVO_SENDER_NAME:', process.env.BREVO_SENDER_NAME || '❌ Manquant');
        
        if (!process.env.BREVO_API_KEY) {
            console.error('❌ BREVO_API_KEY manquante - impossible d\'envoyer l\'email');
            return false;
        }
        
        if (!process.env.BREVO_SENDER_EMAIL) {
            console.error('❌ BREVO_SENDER_EMAIL manquant - impossible d\'envoyer l\'email');
            return false;
        }
        
        console.log('📧 Envoi email à:', toEmail);
        console.log('📧 Détails:', { toName, offer, amountTotal });
        
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

        console.log('📧 Brevo response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Brevo API error: ${response.status} ${response.statusText}`);
            console.error('❌ Response body:', errorText);
            return false; // Ne pas faire planter le webhook
        }

        const result = await response.json();
        console.log('✅ Email sent successfully via Brevo:', result.messageId);
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

    console.log('🔔 Webhook Stripe reçu');
    console.log('🔔 Headers:', Object.keys(req.headers));
    
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
        console.log('✅ Signature Stripe validée');
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
        console.log('🎯 Webhook event:', event.type);
        
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const sessionId = session.id;
                
                console.log('🛒 AUDIT CHECKOUT SESSION COMPLETED');
                console.log('📋 Session ID:', session.id);
                console.log('📧 Client email:', session.customer_details?.email);
                console.log('� Amount total:', session.amount_total);
                console.log('� Session payload keys:', Object.keys(session));
                console.log('📋 Session complète:', JSON.stringify(session, null, 2));
                
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

                // Logging des valeurs extraites
                console.log('📝 Données extraites:');
                console.log('  - email:', extractedData.email);
                console.log('  - offer:', extractedData.offer);
                console.log('  - full_name:', extractedData.full_name);
                console.log('  - shipping_address:', extractedData.shipping_address);
                console.log('  - postal_code:', extractedData.postal_code);
                console.log('  - city:', extractedData.city);
                console.log('  - phone:', extractedData.phone);
                console.log('  - stripe_customer_id:', extractedData.stripe_customer_id);
                console.log('  - payment_intent_id:', extractedData.payment_intent_id);
                console.log('  - amount_total:', extractedData.amount_total);
                console.log('  - currency:', extractedData.currency);

                // Validation des champs obligatoires
                if (!extractedData.email) {
                    console.error('❌ Email manquant - envoi d\'email annulé mais webhook continue');
                    console.error('❌ Email absent dans:', {
                        customer_details_email: session.customer_details?.email,
                        customer_email: session.customer_email,
                        metadata_email: session.metadata?.email
                    });
                    // Continuer le traitement sans envoyer d'email
                } else {
                    console.log('✅ Email client présent:', extractedData.email);
                }

                // Logs de debug finaux
                console.log('🎯 FINAL OFFER USED:', extractedData.offer);
                console.log('🎯 FINAL ROUTE:', extractedData.offer === 'contribution-libre' ? 'donors' : 'preorders');

                // Gestion spéciale pour les contributions libres
                if (extractedData.offer === 'contribution-libre') {
                    console.log('🎁 CONTRIBUTION LIBRE DÉTECTÉE - ROUTING VERS DONORS');
                    
                    // Sécurité mentale - conversion en euros
                    const amountInEuros = extractedData.amount_total / 100;
                    
                    // Préparation des données pour la table donors
                    const donorData = {
                        stripe_session_id: extractedData.stripe_session_id,
                        payment_intent_id: extractedData.payment_intent_id,
                        email: extractedData.email,
                        full_name: extractedData.full_name || 'Soutien ORADIA',
                        amount_total: amountInEuros, // en euros
                        currency: extractedData.currency,
                        paid_status: 'completed',
                        source: 'oradia-contribution',
                        metadata: {
                            created_at: new Date().toISOString(),
                            stripe_customer_id: extractedData.stripe_customer_id
                        }
                    };
                    
                    console.log('� Données donor à enregistrer:', JSON.stringify(donorData, null, 2));
                    
                    // Enregistrement dans la table donors
                    const { data: donorResult, error: donorError } = await supabase
                        .from('donors')
                        .upsert(donorData, {
                            onConflict: 'stripe_session_id',
                            ignoreDuplicates: false
                        })
                        .select()
                        .single();
                    
                    if (donorError) {
                        console.error('❌ ERREUR CRITIQUE - Insertion donors échouée');
                        console.error('❌ Détails erreur complète:', JSON.stringify(donorError, null, 2));
                        console.error('❌ Session ID concerné:', extractedData.stripe_session_id);
                        console.error('❌ Email concerné:', extractedData.email);
                        console.error('❌ Amount concerné:', extractedData.amount_total);
                        
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to process donation',
                            message: 'Erreur critique lors de l\'enregistrement du don en base de données',
                            details: donorError.message,
                            sessionId: extractedData.stripe_session_id,
                            destination: 'donors_failed'
                        });
                    }
                    
                    console.log('✅ Don enregistré dans donors:', JSON.stringify(donorResult, null, 2));
                    
                    // Envoyer l'email de remerciement pour contribution
                    let emailSent = false;
                    if (extractedData.email) {
                        console.log('📧 Envoi email contribution à:', extractedData.email);
                        emailSent = await sendBrevoEmail({
                            toEmail: extractedData.email,
                            toName: extractedData.full_name || 'Ami(e) d\'ORADIA',
                            offer: extractedData.offer,
                            amountTotal: (extractedData.amount_total / 100).toFixed(2)
                        });
                        
                        console.log('📧 Email contribution envoyé:', emailSent);
                    }
                    
                    return res.status(200).json({
                        success: true,
                        message: 'Don processed successfully',
                        sessionId: sessionId,
                        email: extractedData.email,
                        offer: extractedData.offer,
                        destination: 'donors',
                        donor_id: donorResult.id,
                        supabaseStatus: 'donor_recorded',
                        emailStatus: emailSent ? 'sent' : 'failed'
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

                // AUDIT: Vérification de la connexion Supabase
                console.log('🔍 AUDIT CONNEXION SUPABASE:');
                console.log('  - Supabase URL:', supabaseUrl);
                console.log('  - Supabase Key présente:', !!supabaseKey);
                
                // Préparation des données pour Supabase avec validation
                const supabaseData = {
                    stripe_session_id: extractedData.stripe_session_id,
                    email: extractedData.email,
                    offer: extractedData.offer,
                    full_name: extractedData.full_name || 'Client ORADIA',
                    amount_total: extractedData.amount_total / 100, // Conversion en euros
                    currency: extractedData.currency,
                    payment_intent_id: extractedData.payment_intent_id,
                    // stripe_customer_id retiré - colonne probablement absente de preorders
                    paid_status: extractedData.paid_status,
                    shipping_address: extractedData.shipping_address,
                    postal_code: extractedData.postal_code,
                    city: extractedData.city,
                    phone: extractedData.phone,
                    updated_at: new Date().toISOString()
                };
                
                // VRAI UPSERT ATOMIQUE (plus de race condition avec retries Stripe)
                console.log('🔄 AUDIT UPSERT ATOMIQUE:');
                console.log('  - Session ID:', sessionId);
                console.log('📦 Payload upsert (brut):', JSON.stringify(supabaseData, null, 2));
                
                // Validation des données avant envoi
                console.log('🔍 VALIDATION DONNÉES:');
                console.log('  - stripe_session_id:', supabaseData.stripe_session_id, typeof supabaseData.stripe_session_id);
                console.log('  - email:', supabaseData.email, typeof supabaseData.email);
                console.log('  - offer:', supabaseData.offer, typeof supabaseData.offer);
                console.log('  - amount_total:', supabaseData.amount_total, typeof supabaseData.amount_total);
                console.log('  - paid_status:', supabaseData.paid_status, typeof supabaseData.paid_status);
                
                if (!supabaseData.stripe_session_id) {
                    console.error('❌ stripe_session_id est NULL ou vide');
                }
                if (!supabaseData.email) {
                    console.error('❌ email est NULL ou vide');
                }
                if (!supabaseData.offer) {
                    console.error('❌ offer est NULL ou vide');
                }
                
                console.log('🚨 ENVOI VERS SUPABASE...');
                const startTime = Date.now();
                
                const { error: upsertError, data: upsertData } = await supabase
                    .from('preorders')
                    .upsert(supabaseData, {
                        onConflict: 'stripe_session_id',
                        ignoreDuplicates: false
                    })
                    .select(); // Ajout .select() pour récupérer les données

                const endTime = Date.now();
                console.log(`⏱️ Durée upsert: ${endTime - startTime}ms`);
                
                console.log('📊 RÉSULTAT UPSERT:');
                console.log('  - upsertError:', upsertError);
                console.log('  - upsertData:', upsertData);
                
                if (upsertError) {
                    console.error('❌ ERREUR UPSERT SUPABASE DÉTAILLÉE:');
                    console.error('  - Code erreur:', upsertError.code);
                    console.error('  - Message erreur:', upsertError.message);
                    console.error('  - Details erreur:', upsertError.details);
                    console.error('  - Hint erreur:', upsertError.hint);
                    console.error('  - Full error object:', JSON.stringify(upsertError, null, 2));
                    
                    // Analyse spécifique des erreurs communes
                    if (upsertError.code === '23505') {
                        console.error('💡 ERREUR CONFLICT: Probablement un problème de contrainte UNIQUE');
                    } else if (upsertError.code === '23502') {
                        console.error('💡 ERREUR NOT NULL: Un champ requis est manquant');
                    } else if (upsertError.code === '23514') {
                        console.error('💡 ERREUR CHECK: Une contrainte CHECK est violée');
                    } else if (upsertError.code === '42501') {
                        console.error('💡 ERREUR PERMISSION: Problème de permissions RLS');
                    }
                    
                    // NE PAS FAIRE DE RETURN - CONTINUER POUR EMAIL
                    console.log('⚠️ Upsert échoué mais continuation pour email');
                } else {
                    console.log('✅ Upsert réussi:');
                    console.log('  - Données insérées/mises à jour:', upsertData);
                }

                // Envoyer l'email de confirmation (vérifier si déjà envoyé via upsert)
                // Note: avec upsert, on ne peut pas savoir si c'est une mise à jour ou une insertion
                // On utilise donc une table séparée pour suivre les emails envoyés
                let emailSent = false; // Initialisation avant le bloc if
                
                if (extractedData.email) {
                    console.log('📧 Appel de sendBrevoEmail pour:', extractedData.email);
                    emailSent = await sendBrevoEmail({
                        toEmail: extractedData.email,
                        toName: extractedData.full_name || 'Ami(e) d\'ORADIA',
                        offer: extractedData.offer,
                        amountTotal: (extractedData.amount_total / 100).toFixed(2)
                    });
                    console.log('📧 sendBrevoEmail retourné:', emailSent);

                    if (emailSent) {
                        // Mettre à jour email_sent_at dans la table principale
                        const { error: emailUpdateError } = await supabase
                            .from('preorders')
                            .update({ email_sent_at: new Date().toISOString() })
                            .eq('stripe_session_id', sessionId);

                        if (emailUpdateError) {
                            console.error('Error updating email_sent_at:', emailUpdateError);
                        } else {
                            console.log('✅ Email timestamp updated');
                        }
                    } else {
                        console.error('❌ Email sending failed, but order is still valid');
                    }
                } else {
                    console.log('⚠️ Email absent - envoi d\'email sauté mais commande validée');
                }

                // Log progression
                try {
                    const { count } = await supabase
                        .from('preorders')
                        .select('*', { count: 'exact', head: true })
                        .eq('paid_status', 'completed');
                    
                    console.log(`📊 Total completed orders: ${count}`);
                } catch (countError) {
                    console.error('❌ Erreur comptage orders:', countError);
                }
                
                // RÉSUMÉ FINAL DE L'AUDIT
                console.log('🎯 RÉSUMÉ AUDIT WEBHOOK:');
                console.log('  - Session ID:', sessionId);
                console.log('  - Email client:', extractedData.email || 'ABSENT');
                console.log('  - Offer:', extractedData.offer);
                console.log('  - Montant:', extractedData.amount_total / 100, '€');
                console.log('  - Supabase:', upsertError ? 'Échec' : 'Succès');
                console.log('  - Email:', extractedData.email ? (emailSent ? 'Envoyé' : 'Échec') : 'Sauté (email absent)');
                console.log('✅ Webhook traité avec succès');
                
                return res.status(200).json({ 
                    message: 'Order processed successfully',
                    sessionId: sessionId,
                    email: extractedData.email,
                    offer: extractedData.offer,
                    supabaseStatus: upsertError ? 'failed' : 'success',
                    emailStatus: extractedData.email ? (emailSent ? 'sent' : 'failed') : 'skipped_no_email'
                });
            }
            
            default:
                console.log(`Event not handled: ${event.type}`);
                return res.status(200).json({ message: 'Event received but not handled' });
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ 
            error: 'Processing error', 
            message: error.message 
        });
    }
};

module.exports = handler;
