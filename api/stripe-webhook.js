const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Variables d'environnement avec fallbacks
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Création directe du client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Fonction d'envoi d'email Brevo
async function sendBrevoEmail({ toEmail, toName, offer, amountTotal }) {
    try {
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
                subject: 'Ta précommande ORADIA est confirmée',
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
                ✨ Ta précommande est confirmée
              </h2>

              <p style="margin:0 0 18px 0;font-size:18px;line-height:1.7;color:#ffffff;">
                Bonjour${toName ? ' ' + toName : ''},
              </p>

              <p style="margin:0 0 18px 0;font-size:17px;line-height:1.8;color:#e5e7eb;">
                Avec gratitude, nous te confirmons que ta précommande ORADIA a bien été enregistrée.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;background-color:#1c2438;border:1px solid #c9a94d;border-radius:10px;">
                <tr>
                  <td style="padding:18px 20px;font-family:Georgia,serif;color:#f0c75e;font-size:16px;line-height:1.8;">
                    <strong>Offre :</strong> ${offer}<br>
                    <strong>Montant :</strong> ${amountTotal}€
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 18px 0;font-size:17px;line-height:1.8;color:#e5e7eb;">
                Ton oracle est maintenant en préparation. Nous te recontacterons personnellement dès qu'il sera prêt.
              </p>

              <p style="margin:0 0 12px 0;font-size:17px;line-height:1.8;color:#e5e7eb;">
                Merci pour ta confiance et pour accueillir la sagesse d'ORADIA dans ta vie.
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
                textContent: `Ta précommande ORADIA est confirmée

Bonjour${toName ? ' ' + toName : ''},

Avec une immense gratitude, nous te confirmons que ta précommande ORADIA a été enregistrée avec succès.

Offre choisie : ${offer}
Montant : ${amountTotal}€

Ton oracle est maintenant en préparation. Nous te recontacterons personnellement dès qu'il sera prêt à t'accompagner dans ton voyage intérieur.

Merci pour ta confiance et pour choisir d'accueillir la sagesse d'ORADIA dans ta vie.

Avec toute notre gratitude,
Rudy
Fondateur d'ORADIA
oradia.fr`
            })
        });

        if (!response.ok) {
            throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('Email sent successfully via Brevo:', result.messageId);
        return true;

    } catch (error) {
        console.error('Failed to send email via Brevo:', error);
        return false;
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
        console.log('✅ Signature Stripe validée');
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const sessionId = session.id;
                
                console.log('🛒 Processing checkout.session.completed:', sessionId);
                console.log('📋 Session payload keys:', Object.keys(session));

                // Extraction robuste des données avec fallbacks
                const extractedData = {
                    // Email avec fallbacks multiples
                    email: session.customer_details?.email || 
                           session.customer_email || 
                           session.metadata?.email || 
                           null,
                    
                    // Offer depuis metadata (obligatoire)
                    offer: session.metadata?.offer || null,
                    
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
                    console.error('❌ Email manquant - impossible de continuer');
                    return res.status(400).json({ 
                        error: 'Missing required field: email',
                        message: 'Email is required for preorder processing'
                    });
                }

                if (!extractedData.offer) {
                    console.error('❌ Offer manquant - impossible de continuer');
                    return res.status(400).json({ 
                        error: 'Missing required field: offer',
                        message: 'Offer is required for preorder processing'
                    });
                }

                // Idempotence: vérifier si la session existe déjà
                const { data: existingOrder, error: fetchError } = await supabase
                    .from('preorders')
                    .select('id, paid_status, email_sent_at')
                    .eq('stripe_session_id', sessionId)
                    .single();

                if (fetchError && fetchError.code !== 'PGRST116') {
                    console.error('Database error checking existing order:', fetchError);
                    return res.status(500).json({ 
                        error: 'Database error', 
                        message: fetchError.message 
                    });
                }

                // Préparation de l'objet pour Supabase (compatible avec table existante)
                const supabaseData = {
                    stripe_session_id: extractedData.stripe_session_id,
                    email: extractedData.email,
                    offer: extractedData.offer,
                    full_name: extractedData.full_name,
                    amount_total: extractedData.amount_total / 100, // Conversion en euros
                    currency: extractedData.currency,
                    payment_intent_id: extractedData.payment_intent_id,
                    stripe_customer_id: extractedData.stripe_customer_id,
                    paid_status: extractedData.paid_status,
                    shipping_address: extractedData.shipping_address,
                    postal_code: extractedData.postal_code,
                    city: extractedData.city,
                    phone: extractedData.phone,
                    updated_at: new Date().toISOString()
                };

                // Log de l'objet exact envoyé à Supabase
                console.log('📦 Objet Supabase upsert:');
                console.log(JSON.stringify(supabaseData, null, 2));

                if (existingOrder) {
                    // Update existing order
                    const { error: updateError } = await supabase
                        .from('preorders')
                        .update(supabaseData)
                        .eq('stripe_session_id', sessionId);

                    if (updateError) {
                        console.error('Error updating order:', updateError);
                        return res.status(500).json({ 
                            error: 'Update failed', 
                            message: updateError.message 
                        });
                    }
                    console.log('Order updated:', sessionId);
                } else {
                    // Insert new order
                    const insertData = {
                        ...supabaseData,
                        created_at: new Date().toISOString()
                    };

                    const { error: insertError } = await supabase
                        .from('preorders')
                        .insert(insertData);

                    if (insertError) {
                        console.error('Error creating order:', insertError);
                        return res.status(500).json({ 
                            error: 'Insert failed', 
                            message: insertError.message 
                        });
                    }
                    console.log('New order created:', sessionId);
                }

                // Envoyer l'email de confirmation si pas déjà envoyé
                if (!existingOrder || !existingOrder.email_sent_at) {
                    console.log('Sending confirmation email...');
                    const emailSent = await sendBrevoEmail({
                        toEmail: extractedData.email,
                        toName: extractedData.full_name || 'Ami(e) d\'ORADIA',
                        offer: extractedData.offer,
                        amountTotal: (extractedData.amount_total / 100).toFixed(2)
                    });

                    if (emailSent) {
                        // Mettre à jour email_sent_at
                        const { error: emailUpdateError } = await supabase
                            .from('preorders')
                            .update({ email_sent_at: new Date().toISOString() })
                            .eq('stripe_session_id', sessionId);

                        if (emailUpdateError) {
                            console.error('Error updating email_sent_at:', emailUpdateError);
                        } else {
                            console.log('Email timestamp updated');
                        }
                    } else {
                        console.error('Email sending failed, but order is still valid');
                    }
                }

                // Log progression
                const { count } = await supabase
                    .from('preorders')
                    .select('*', { count: 'exact', head: true })
                    .eq('paid_status', 'completed');
                
                console.log(`Total completed orders: ${count}`);
                
                return res.status(200).json({ 
                    message: 'Order processed successfully',
                    sessionId: sessionId,
                    email: extractedData.email,
                    offer: extractedData.offer
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
