const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Service Stripe
class StripeService {
  constructor() {
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  // Envoyer un email Brevo
  async sendBrevoEmail({ toEmail, toName, offer, amountTotal, type = 'payment' }) {
    try {
      if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
        console.error('Configuration Brevo manquante');
        return false;
      }

      const SibApiV3Sdk = require('sib-api-v3-sdk');
      const defaultClient = SibApiV3Sdk.ApiClient.instance;
      defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

      const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
      
      const isSubscription = type === 'subscription';
      const isCreditPack = type === 'credit_pack';
      
      const subject = isSubscription 
        ? 'Bienvenue dans le Tore ORADIA 🌟'
        : isCreditPack
        ? 'Tes crédits ORADIA sont disponibles ✨'
        : 'Merci pour ton achat ORADIA';

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
</head>
<body style="font-family: Georgia, serif; background: #0b1c2c; color: #c8a96a; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; background: #1a2f4a; border-radius: 15px; overflow: hidden; border: 2px solid #c8a96a;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #c8a96a, #d4b574); padding: 30px; text-align: center;">
            <h1 style="color: #0b1c2c; margin: 0; font-size: 28px;">ORADIA</h1>
            <p style="color: #0b1c2c; margin: 10px 0 0 0; font-size: 16px;">${isSubscription ? 'Bienvenue dans l\'expérience ultime' : 'Merci pour ta confiance'}</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
            <p style="font-size: 16px; line-height: 1.6;">
                Bonjour${toName ? ' ' + toName : ''},
            </p>
            
            <p style="font-size: 16px; line-height: 1.6;">
                ${isSubscription 
                  ? `Félicitations ! Tu fais maintenant partie du Tore ORADIA. Ton accès illimité est activé et tu peux commencer ton voyage de transformation profonde.`
                  : isCreditPack
                  ? `Super ! Tes ${offer.includes('3') ? '3' : offer.includes('10') ? '10' : '25'} tirages supplémentaires sont maintenant disponibles sur ton espace ORADIA.`
                  : `Merci pour ton achat. Ton paiement de ${amountTotal}€ a été reçu avec succès.`
                }
            </p>
            
            <div style="background: rgba(200, 169, 106, 0.1); border-left: 4px solid #c8a96a; padding: 20px; margin: 30px 0; border-radius: 5px;">
                <p style="margin: 0; font-size: 16px;">
                    <strong>Offre choisie :</strong> ${offer}<br>
                    <strong>Montant :</strong> ${amountTotal}€
                    ${isSubscription ? '<br><strong>Statut :</strong> Actif' : ''}
                </p>
            </div>
            
            ${isSubscription ? `
            <p style="font-size: 16px; line-height: 1.6;">
                Tu peux maintenant accéder à toutes les fonctionnalités du Tore : tirages illimités, analyses approfondies, et accompagnement personnalisé.
            </p>
            ` : ''}
            
            <div style="text-align: center; margin: 40px 0;">
                <a href="https://oradia.fr${isSubscription ? '/member/dashboard.html' : '/index.html'}" 
                   style="background: linear-gradient(135deg, #c8a96a, #d4b574); color: #0b1c2c; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                    ${isSubscription ? 'Accéder au Tore' : 'Retourner sur ORADIA'}
                </a>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #0b1c2c; padding: 30px; text-align: center; border-top: 2px solid #c8a96a;">
            <p style="margin: 0; font-size: 14px; opacity: 0.8;">
                Avec toute notre gratitude,<br>
                L'équipe ORADIA
            </p>
            <p style="margin: 20px 0 0 0; font-size: 12px; opacity: 0.6;">
                <a href="https://oradia.fr" style="color: #c8a96a; text-decoration: none;">oradia.fr</a>
            </p>
        </div>
    </div>
</body>
</html>`;

      const sendSmtpEmail = {
        to: [{ email: toEmail, name: toName || 'Ami(e) d\'ORADIA' }],
        templateId: null,
        sender: { email: process.env.BREVO_SENDER_EMAIL, name: 'ORADIA' },
        subject: subject,
        htmlContent: htmlContent,
        textContent: `${subject}

Bonjour${toName ? ' ' + toName : ''},

${isSubscription 
  ? `Félicitations ! Tu fais maintenant partie du Tore ORADIA. Ton accès illimité est activé.`
  : isCreditPack
  ? `Tes crédits ORADIA sont maintenant disponibles.`
  : `Merci pour ton achat de ${amountTotal}€.`
}

Offre: ${offer}
${isSubscription ? 'Statut: Actif' : ''}

Avec toute notre gratitude,
L'équipe ORADIA
oradia.fr`
      };

      const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log('Email Brevo envoyé:', result.messageId);
      return true;
    } catch (error) {
      console.error('Erreur envoi email Brevo:', error.message);
      return false;
    }
  }

  // Ajouter des crédits Traversée
  async addTraverseeCredits(userId, creditsCount, paymentId, amount) {
    try {
      // Vérifier si l'utilisateur existe, sinon le créer
      let { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (userError && userError.code === 'PGRST116') {
        // L'utilisateur n'existe pas, le créer
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({ id: userId })
          .select()
          .single();
        
        if (createError) {
          console.error('Erreur création utilisateur:', createError);
          return { success: false, error: createError.message };
        }
        user = newUser;
      }

      // Ajouter ou mettre à jour les crédits
      let { data: credit, error: creditError } = await supabase
        .from('credits')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (creditError && creditError.code === 'PGRST116') {
        // Créer un enregistrement de crédits
        const { data: newCredit, error: createCreditError } = await supabase
          .from('credits')
          .insert({
            user_id: userId,
            credits: parseInt(creditsCount),
            total_purchased: parseInt(creditsCount),
            last_purchase: new Date().toISOString(),
            purchase_history: [{
              credits: parseInt(creditsCount),
              amount: amount,
              payment_id: paymentId,
              date: new Date().toISOString()
            }]
          })
          .select()
          .single();

        if (createCreditError) {
          console.error('Erreur création crédits:', createCreditError);
          return { success: false, error: createCreditError.message };
        }

        console.log(`Crédits créés: ${creditsCount} pour utilisateur ${userId}`);
        return { success: true, credits: newCredit.credits };
      } else {
        // Mettre à jour les crédits existants
        const updatedHistory = [...(credit.purchase_history || []), {
          credits: parseInt(creditsCount),
          amount: amount,
          payment_id: paymentId,
          date: new Date().toISOString()
        }];

        const { data: updatedCredit, error: updateError } = await supabase
          .from('credits')
          .update({
            credits: credit.credits + parseInt(creditsCount),
            total_purchased: credit.total_purchased + parseInt(creditsCount),
            last_purchase: new Date().toISOString(),
            purchase_history: updatedHistory
          })
          .eq('user_id', userId)
          .select()
          .single();

        if (updateError) {
          console.error('Erreur mise à jour crédits:', updateError);
          return { success: false, error: updateError.message };
        }

        console.log(`Crédits ajoutés: ${creditsCount} pour utilisateur ${userId}`);
        return { success: true, credits: updatedCredit.credits };
      }
    } catch (error) {
      console.error('Erreur ajout crédits:', error);
      return { success: false, error: error.message };
    }
  }

  // Créer un abonnement Tore
  async createToreSubscription(userId, stripeCustomerId, stripeSubscriptionId) {
    try {
      // Récupérer les détails de l'abonnement depuis Stripe
      const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      
      // Si userId n'est pas fourni, essayer de le récupérer depuis les métadonnées du client
      if (!userId && stripeCustomerId) {
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        userId = customer.metadata?.userId;
      }
      
      // Si toujours pas d'userId, utiliser l'email pour trouver l'utilisateur
      if (!userId && stripeCustomerId) {
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('email', customer.email)
          .single();
        userId = user?.id;
      }
      
      if (!userId) {
        console.error('Impossible de trouver l\'userId pour l\'abonnement:', stripeCustomerId);
        return { success: false, error: 'Utilisateur non trouvé' };
      }
      
      // Vérifier si l'utilisateur existe, sinon le créer
      let { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', userId)
        .single();

      if (userError && userError.code === 'PGRST116') {
        // Créer l'utilisateur
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: customer.email,
            full_name: customer.name || null
          })
          .select()
          .single();
        
        if (createError) {
          console.error('Erreur création utilisateur:', createError);
          return { success: false, error: createError.message };
        }
        user = newUser;
      }

      // Créer ou mettre à jour l'abonnement
      const accessCode = 'TORE-' + Date.now().toString(36).toUpperCase();
      
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          access_code: accessCode
        }, {
          onConflict: 'stripe_subscription_id'
        })
        .select()
        .single();

      if (subscriptionError) {
        console.error('Erreur création abonnement:', subscriptionError);
        return { success: false, error: subscriptionError.message };
      }

      console.log(`Abonnement Tore créé/mis à jour pour utilisateur ${userId}`);
      return { success: true, subscription: subscriptionData };
    } catch (error) {
      console.error('Erreur création abonnement:', error);
      return { success: false, error: error.message };
    }
  }

  // Traiter la complétion de session checkout
  async handleCheckoutSessionCompleted(session) {
    const metadata = session.metadata || {};
    const { userId, productType, credits, offer } = metadata;
    
    console.log('Traitement session complétée:', {
      sessionId: session.id,
      productType,
      userId,
      credits,
      offer,
      customer: session.customer,
      subscription: session.subscription
    });
    
    let emailResult = false;
    let userEmail = session.customer_details?.email || session.customer_email || metadata?.email;
    let userName = session.customer_details?.name || metadata?.full_name;
    let amount = session.amount_total / 100;
    
    if (productType === 'traversee' || productType === 'credit_pack') {
      const result = await this.addTraverseeCredits(userId, credits, session.id, amount);
      if (result.success && userEmail) {
        emailResult = await this.sendBrevoEmail({
          toEmail: userEmail,
          toName: userName,
          offer: offer || (productType === 'credit_pack' ? 'Pack de crédits' : 'La Traversée - 5 tirages guidés'),
          amountTotal: amount,
          type: 'credit_pack'
        });
      }
    } else if (productType === 'tore' || offer === 'tore-subscription') {
      const result = await this.createToreSubscription(userId, session.customer, session.subscription);
      if (result.success && userEmail) {
        emailResult = await this.sendBrevoEmail({
          toEmail: userEmail,
          toName: userName,
          offer: 'Le Tore - Abonnement mensuel',
          amountTotal: amount,
          type: 'subscription'
        });
      }
    } else if (productType === 'preorder') {
      // Les précommandes sont gérées par le webhook séparé
      console.log('Précommande reçue - gérée par webhook séparé:', metadata);
    }
    
    console.log(`Session ${session.id} traitée | Email: ${emailResult ? 'Envoyé' : 'Non envoyé'}`);
  }

  // Gérer le webhook principal
  async handleWebhook(sig, body) {
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, this.webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return { success: false, error: 'Invalid signature' };
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          // Gérer le succès de paiement d'abonnement
          console.log('Invoice payment succeeded:', event.data.object.id);
          break;
        case 'invoice.payment_failed':
          // Gérer l'échec de paiement d'abonnement
          console.log('Invoice payment failed:', event.data.object.id);
          break;
        case 'customer.subscription.deleted':
          // Gérer l'annulation d'abonnement
          console.log('Subscription deleted:', event.data.object.id);
          break;
        default:
          console.log(`Event not handled: ${event.type}`);
      }
      return { success: true };
    } catch (error) {
      console.error('Webhook processing error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Handler Vercel
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeService = new StripeService();
  const sig = req.headers['stripe-signature'];
  
  try {
    const result = await stripeService.handleWebhook(sig, req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
