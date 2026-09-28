// lib/member-subscription.js
// Gestion de l'abonnement Tore par le membre lui-même (espace membre) :
// - authentification par le jeton Supabase de la session membre (Authorization: Bearer),
//   jamais par un simple email envoyé par le navigateur ;
// - résiliation / réactivation du renouvellement (cancel_at_period_end côté Stripe) ;
// - portail de facturation Stripe (moyen de paiement, factures, résiliation).
//
// Utilisé par api/auth/index.js (update-auto-renew) et api/create-checkout-session.js
// (billing-portal) — pas de nouvelle fonction Vercel (12/12).

// Retourne { email, userId } si le jeton est valide, sinon null.
async function getMemberFromRequest(supabase, req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.email) return null;
    return { email: data.user.email.toLowerCase(), userId: data.user.id };
  } catch {
    return null;
  }
}

// Ligne tore_subscriptions la plus récente ayant un client Stripe.
async function getStripeRow(supabase, email) {
  const { data } = await supabase
    .from('tore_subscriptions')
    .select('id, stripe_customer_id, stripe_subscription_id')
    .ilike('email', email)
    .not('stripe_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Abonnement Stripe en cours (actif, en essai ou impayé) du membre.
async function findLiveSubscription(stripe, row) {
  if (row.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      if (['active', 'trialing', 'past_due'].includes(sub.status)) return sub;
    } catch (e) {
      if (e?.code !== 'resource_missing') throw e;
    }
  }
  const list = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: 'all', limit: 10 });
  return list.data.find(s => ['active', 'trialing', 'past_due'].includes(s.status)) || null;
}

// autoRenew=false → résiliation en fin de période (accès conservé jusque-là) ;
// autoRenew=true → annule une résiliation programmée.
async function setAutoRenew(stripe, supabase, email, autoRenew) {
  const row = await getStripeRow(supabase, email);
  if (!row) return { status: 404, error: 'Aucun abonnement Stripe trouvé pour ce compte' };
  const sub = await findLiveSubscription(stripe, row);
  if (!sub) return { status: 404, error: 'Aucun abonnement en cours à modifier' };
  const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: !autoRenew });
  const periodEnd = updated.current_period_end || updated.items?.data?.[0]?.current_period_end || null;
  const { error } = await supabase.from('tore_subscriptions').update({
    cancel_at_period_end: !autoRenew,
    stripe_subscription_id: updated.id,
    updated_at: new Date().toISOString()
  }).eq('id', row.id);
  if (error) console.error('[auto-renew] mise à jour Supabase:', error.message);
  return {
    status: 200,
    autoRenew: !updated.cancel_at_period_end,
    periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    trial: updated.status === 'trialing'
  };
}

// Configuration du portail client : la première configuration active du compte,
// créée si le compte n'en a aucune (sinon Stripe refuse d'ouvrir le portail).
async function getPortalConfigurationId(stripe) {
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 10 });
  const found = list.data.find(c => c.is_default) || list.data[0];
  if (found) return found.id;
  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: 'Oradia — gérer mon abonnement au tirage du Tore',
      privacy_policy_url: 'https://oradia.fr/politique-confidentialite.html',
      terms_of_service_url: 'https://oradia.fr/cgv.html'
    },
    default_return_url: 'https://oradia.fr/member/abonnements.html',
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' }
    }
  });
  return created.id;
}

module.exports = { getMemberFromRequest, getStripeRow, setAutoRenew, getPortalConfigurationId };
