const supabase = require('../lib/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const handler = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
        console.error('Missing webhook signature or secret');
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
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const sessionId = session.id;
                
                console.log(`Processing checkout.session.completed: ${sessionId}`);

                // Idempotence: vérifier si la session existe déjà
                const { data: existingOrder, error: fetchError } = await supabase
                    .from('preorders')
                    .select('id, paid_status')
                    .eq('stripe_session_id', sessionId)
                    .single();

                if (fetchError && fetchError.code !== 'PGRST116') {
                    console.error('Database error checking existing order:', fetchError);
                    return res.status(500).json({ error: 'Database error' });
                }

                const updateData = {
                    paid_status: 'completed',
                    payment_intent_id: session.payment_intent,
                    amount_total: session.amount_total,
                    currency: session.currency,
                    full_name: session.metadata?.full_name || null,
                    city: session.metadata?.city || null,
                    postal_code: session.metadata?.postal_code || null,
                    updated_at: new Date().toISOString()
                };

                if (existingOrder) {
                    // Update existing order
                    const { error: updateError } = await supabase
                        .from('preorders')
                        .update(updateData)
                        .eq('stripe_session_id', sessionId);

                    if (updateError) {
                        console.error('Error updating order:', updateError);
                        return res.status(500).json({ error: 'Update failed' });
                    }
                    console.log(`Order updated: ${sessionId}`);
                } else {
                    // Insert new order (cas où l'insert initiale a échoué)
                    const insertData = {
                        ...updateData,
                        stripe_session_id: sessionId,
                        email: session.customer_email,
                        offer: session.metadata?.offer || 'standard',
                        shipping_address: session.metadata?.shipping_address || null,
                        source: session.metadata?.source || 'oradia-precommande',
                        created_at: new Date().toISOString()
                    };

                    const { error: insertError } = await supabase
                        .from('preorders')
                        .insert(insertData);

                    if (insertError) {
                        console.error('Error creating order:', insertError);
                        return res.status(500).json({ error: 'Insert failed' });
                    }
                    console.log(`New order created: ${sessionId}`);
                }

                // Log progression
                const { count } = await supabase
                    .from('preorders')
                    .select('*', { count: 'exact', head: true })
                    .eq('paid_status', 'completed');
                
                console.log(`Total completed orders: ${count}`);
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return res.status(200).json({ received: true });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ error: 'Processing failed' });
    }
};

module.exports = handler;

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
