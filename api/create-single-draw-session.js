import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { email } = req.body;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price: process.env.STRIPE_SINGLE_DRAW_PRICE_ID,
        quantity: 1,
      }],
      customer_email: email || undefined,
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/tore.html?single_draw=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/tore.html?single_draw=cancel`,
      metadata: { type: 'single_tore_draw' },
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[single-draw] Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
