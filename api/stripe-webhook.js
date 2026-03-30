const supabase = require('../lib/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// LOG TEMPORAIRE: Détection environnement
const stripeKey = process.env.STRIPE_SECRET_KEY;
console.log('🔍 Webhook Stripe secret key prefix:', stripeKey ? stripeKey.substring(0, 7) : 'undefined');
console.log('🔍 Webhook Environment:', process.env.NODE_ENV || 'development');

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
                
                console.log(`🛒 Processing checkout.session.completed: ${sessionId}`);
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
                    .select('id, paid_status')
                    .eq('stripe_session_id', sessionId)
                    .single();

                if (fetchError && fetchError.code !== 'PGRST116') {
                    console.error('❌ Database error checking existing order:', fetchError);
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
                    console.log('🔄 Mise à jour de la commande existante');
                    const { error: updateError } = await supabase
                        .from('preorders')
                        .update(supabaseData)
                        .eq('stripe_session_id', sessionId);

                    if (updateError) {
                        console.error('❌ Error updating order:', updateError);
                        return res.status(500).json({ 
                            error: 'Update failed', 
                            message: updateError.message 
                        });
                    }
                    console.log(`✅ Order updated: ${sessionId}`);
                } else {
                    // Insert new order
                    console.log('➕ Création d\'une nouvelle commande');
                    const insertData = {
                        ...supabaseData,
                        created_at: new Date().toISOString()
                    };

                    const { error: insertError } = await supabase
                        .from('preorders')
                        .insert(insertData);

                    if (insertError) {
                        console.error('❌ Error creating order:', insertError);
                        return res.status(500).json({ 
                            error: 'Insert failed', 
                            message: insertError.message 
                        });
                    }
                    console.log(`✅ New order created: ${sessionId}`);
                }

                // Log progression
                const { count } = await supabase
                    .from('preorders')
                    .select('*', { count: 'exact', head: true })
                    .eq('paid_status', 'completed');
                
                console.log(`📊 Total completed orders: ${count}`);
                
                return res.status(200).json({ 
                    message: 'Order processed successfully',
                    sessionId: sessionId,
                    email: extractedData.email,
                    offer: extractedData.offer
                });
            }
            
            default:
                console.log(`ℹ️ Event not handled: ${event.type}`);
                return res.status(200).json({ message: 'Event received but not handled' });
        }
    } catch (error) {
        console.error('🚨 Webhook processing error:', error);
        return res.status(500).json({ 
            error: 'Processing error', 
            message: error.message 
        });
    }
};

module.exports = handler;
