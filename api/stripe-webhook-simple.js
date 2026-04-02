// Version simplifiée du webhook Stripe pour test immédiat
// Corrige toutes les erreurs de référence

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Variables d'environnement
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Fonction email simplifiée
async function sendBrevoEmail({ toEmail, toName, offer, amountTotal }) {
    try {
        console.log('📧 Envoi email à:', toEmail);
        
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
                subject: 'Ta précommande ORADIA est confirmée',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #0b1c2c;">
                        <h2 style="color: #c8a96a;">✨ Merci pour ta confiance</h2>
                        <p>Ta précommande a été enregistrée avec succès.</p>
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Offre:</strong> ${offer}</p>
                            <p><strong>Montant:</strong> ${amountTotal}€</p>
                        </div>
                        <p>Nous t'enverrons une confirmation dès que ton oracle sera prêt à être expédié.</p>
                        <p>À très bientôt,</p>
                        <p><em>L'équipe ORADIA</em></p>
                    </div>
                `
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Brevo API error: ${response.status} ${response.statusText}`);
            console.error('❌ Response body:', errorText);
            return false;
        }

        const result = await response.json();
        console.log('✅ Email sent successfully via Brevo:', result.messageId);
        return true;
    } catch (error) {
        console.error('❌ Failed to send email via Brevo:', error.message);
        return false;
    }
}

const handler = async (req, res) => {
    try {
        console.log('🎯 Webhook Stripe Simplifié appelé');
        console.log('📋 Méthode:', req.method);

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const signature = req.headers['stripe-signature'];
        console.log('📋 Signature Stripe:', signature ? '✅' : '❌');

        // Vérification de la signature
        let event;
        try {
            event = require('stripe').webhooks.constructEvent(req.body, signature, webhookSecret);
            console.log('✅ Signature vérifiée');
        } catch (err) {
            console.error('❌ Erreur signature:', err.message);
            return res.status(400).json({ error: 'Invalid signature' });
        }

        console.log('🎯 Event type:', event.type);

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const sessionId = session.id;
                
                console.log('🛒 CHECKOUT SESSION COMPLETED');
                console.log('  - Session ID:', sessionId);
                console.log('  - Email:', session.customer_details?.email);
                console.log('  - Offer:', session.metadata?.offer);
                console.log('  - Amount:', session.amount_total / 100, '€');

                // Extraction des données
                const extractedData = {
                    email: session.customer_details?.email || session.customer_email || session.metadata?.email || null,
                    offer: session.metadata?.offer || null,
                    full_name: session.metadata?.full_name || session.customer_details?.name || null,
                    stripe_session_id: sessionId,
                    amount_total: session.amount_total || 0,
                    currency: session.currency || 'eur',
                    payment_intent_id: session.payment_intent || null,
                    stripe_customer_id: session.customer || null,
                    paid_status: 'completed',
                    shipping_address: session.metadata?.shipping_address || null,
                    postal_code: session.metadata?.postal_code || null,
                    city: session.metadata?.city || null,
                    phone: session.metadata?.phone || null
                };

                console.log('📊 Données extraites:', extractedData);

                // Validation
                if (!extractedData.email || !extractedData.offer) {
                    console.error('❌ Données manquantes:', { email: !!extractedData.email, offer: !!extractedData.offer });
                    return res.status(400).json({ error: 'Missing required data' });
                }

                // Préparation données Supabase
                const supabaseData = {
                    stripe_session_id: extractedData.stripe_session_id,
                    email: extractedData.email,
                    offer: extractedData.offer,
                    full_name: extractedData.full_name,
                    amount_total: extractedData.amount_total / 100,
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

                console.log('📦 Données Supabase:', JSON.stringify(supabaseData, null, 2));

                // Upsert Supabase
                console.log('🚨 Envoi vers Supabase...');
                const { error: upsertError, data: upsertData } = await supabase
                    .from('preorders')
                    .upsert(supabaseData, {
                        onConflict: 'stripe_session_id',
                        ignoreDuplicates: false
                    })
                    .select();

                if (upsertError) {
                    console.error('❌ Erreur Supabase:', upsertError);
                } else {
                    console.log('✅ Supabase upsert réussi:', upsertData);
                }

                // Email
                let emailSent = false;
                if (extractedData.email) {
                    console.log('📧 Envoi email...');
                    emailSent = await sendBrevoEmail({
                        toEmail: extractedData.email,
                        toName: extractedData.full_name || 'Ami(e) d\'ORADIA',
                        offer: extractedData.offer,
                        amountTotal: (extractedData.amount_total / 100).toFixed(2)
                    });
                    console.log('📧 Résultat email:', emailSent);
                }

                // Réponse
                const response = {
                    message: 'Order processed successfully',
                    sessionId: sessionId,
                    email: extractedData.email,
                    offer: extractedData.offer,
                    supabaseStatus: upsertError ? 'failed' : 'success',
                    emailStatus: extractedData.email ? (emailSent ? 'sent' : 'failed') : 'skipped'
                };

                console.log('✅ Webhook terminé:', response);
                return res.status(200).json(response);
            }

            default:
                console.log(`Event not handled: ${event.type}`);
                return res.status(200).json({ message: 'Event received but not handled' });
        }

    } catch (error) {
        console.error('❌ Erreur webhook:', error);
        return res.status(500).json({ 
            error: 'Processing error', 
            message: error.message 
        });
    }
};

module.exports = handler;
