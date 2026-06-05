const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

  // Créer une session de précommande pour l'Oracle physique avec panier et livraison
  async createPreorderSession({ items, customerInfo, delivery, productPrice, shippingPrice, totalAmount }) {
    try {
      // Créer les line items pour chaque produit du panier
      const lineItems = [];
      
      items.forEach(item => {
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.offer.name,
              description: item.offer.description,
              images: ['https://oradia.vercel.app/images/logo-hd-v2.jpeg']
            },
            unit_amount: item.offer.price, // Prix unitaire
          },
          quantity: item.quantity, // Quantité commandée
        });
      });
      
      // Ajouter la livraison avec le bon nom selon le mode
      const deliveryName = delivery.method === 'home' ? 'Livraison à domicile' : 
                          delivery.method === 'relay' ? 'Point relais Mondial Relay' : 
                          'Remise en main propre';
      
      // N'ajouter la ligne de livraison que si le prix > 0
      if (shippingPrice > 0) {
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: {
              name: deliveryName,
              description: `Livraison Oracle Oradia - ${delivery.method === 'home' ? 'Standard' : delivery.method === 'relay' ? 'Point relais Mondial Relay' : 'Remise en main propre'}`,
            },
            unit_amount: shippingPrice,
          },
          quantity: 1, // Livraison unique par commande
        });
      }

      // Configuration des pays autorisés selon le mode de livraison
      const allowedCountries = delivery.method === 'home' 
        ? ['FR', 'BE', 'LU', 'CH'] // Livraison à domicile : pays européens
        : delivery.method === 'relay'
        ? ['FR'] // Point relais : France uniquement
        : ['FR']; // Remise en main propre : France

      const session = await stripe.checkout.sessions.create({
        customer_email: customerInfo.email,
        payment_method_types: ['card'],
        mode: 'payment',
        shipping_address_collection: delivery.method === 'hand_delivery' ? null : {
          allowed_countries: allowedCountries,
        },
        line_items: lineItems,
        success_url: `${process.env.FRONTEND_URL}/success-preorder?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/livraison.html`,
        metadata: {
          productType: 'preorder',
          items: JSON.stringify(items.map(item => ({
            offer: item.offer.name,
            quantity: item.quantity,
            price: item.offer.price
          }))),
          customerInfo: JSON.stringify({
            firstName: customerInfo.firstName,
            lastName: customerInfo.lastName,
            fullName: customerInfo.fullName,
            email: customerInfo.email,
            phone: customerInfo.phone || '',
            shippingAddress: customerInfo.shippingAddress,
            addressComplement: customerInfo.addressComplement || '',
            postalCode: customerInfo.postalCode,
            city: customerInfo.city,
            country: customerInfo.country
          }),
          delivery: JSON.stringify({
            method: delivery.method,
            price: shippingPrice
          }),
          productPrice: productPrice.toString(),
          shippingPrice: shippingPrice.toString(),
          totalAmount: totalAmount.toString()
        },
        customer_creation: 'always'
      });

      return { success: true, sessionId: session.id, url: session.url };
    } catch (error) {
      console.error('Erreur création session précommande:', error);
      return { success: false, error: error.message };
    }
  }

  // Créer une session de paiement pour la Traversée (5 crédits)
  async createTraverseeSession(userId, userEmail) {
    try {
      const session = await stripe.checkout.sessions.create({
        customer_email: userEmail,
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'La Traversée - 5 tirages guidés',
              description: 'Accès à 5 tirages guidés de la Traversée avec interprétation complète',
              images: ['https://oradia.vercel.app/images/logo-hd-v2.jpeg']
            },
            unit_amount: 300, // 3.00€ en centimes
          },
          quantity: 1,
        }],
        success_url: `${process.env.FRONTEND_URL}/success-traversee?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/index.html#offres`,
        metadata: {
          userId: userId.toString(),
          productType: 'traversee',
          credits: '5'
        }
      });

      return { success: true, sessionId: session.id, url: session.url };
    } catch (error) {
      // console.error(console.error('Erreur création session Traversée:', error);)
      return { success: false, error: error.message };
    }
  }

  // Créer une session d'abonnement pour le Tore
  async createToreSession(userId, userEmail) {
    try {
      // D'abord créer ou récupérer le client Stripe
      let customer;
      const existingCustomers = await stripe.customers.list({ email: userEmail, limit: 1 });
      
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            userId: userId.toString()
          }
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Le Tore - Abonnement mensuel',
              description: 'Accès illimité aux tirages et fonctionnalités avancées',
              images: ['https://oradia.vercel.app/images/logo-hd-v2.jpeg']
            },
            unit_amount: 800, // 8.00€ en centimes
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
          },
          quantity: 1,
        }],
        success_url: `${process.env.FRONTEND_URL}/success-tore?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/index.html#offres`,
        metadata: {
          userId: userId.toString(),
          productType: 'tore'
        }
      });

      return { success: true, sessionId: session.id, url: session.url };
    } catch (error) {
      // console.error(console.error('Erreur création session Tore:', error);)
      return { success: false, error: error.message };
    }
  }

  // Traiter le webhook Stripe
  async handleWebhook(sig, body) {
    let event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, this.webhookSecret);
    } catch (err) {
      // console.error(console.error('Erreur signature webhook:', err);)
      return { success: false, error: 'Signature webhook invalide' };
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;

        default:
          // console.log(console.log(`Événement non traité: ${event.type}`);)
      }

      return { success: true };
    } catch (error) {
      // console.error(console.error('Erreur traitement webhook:', error);)
      return { success: false, error: error.message };
    }
  }

  // Créer une session Stripe pour l'achat d'un pack de crédits
  async createCreditPackSession({ userId, email, pack, credits, price, label }) {
    try {
      const session = await stripe.checkout.sessions.create({
        customer_email: email,
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Pack de tirages — ${label}`,
              description: `${credits} tirage(s) supplémentaire(s) sur Oradia`,
              images: ['https://oradia.fr/images/logo-hd-v2.jpeg']
            },
            unit_amount: price
          },
          quantity: 1
        }],
        success_url: `${process.env.FRONTEND_URL}/success-credits?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/pelerin.html`,
        metadata: {
          userId: userId.toString(),
          productType: 'credit_pack',
          pack,
          credits: credits.toString()
        }
      });
      return { success: true, sessionId: session.id, url: session.url };
    } catch (error) {
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

  // Traiter le succès de paiement d'abonnement
  async handleInvoicePaymentSucceeded(invoice) {
    const subscriptionId = invoice.subscription;
    
    try {
      const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
      
      if (subscription) {
        subscription.status = 'active';
        subscription.currentPeriodStart = new Date(invoice.period_start * 1000);
        subscription.currentPeriodEnd = new Date(invoice.period_end * 1000);
        await subscription.save();
        
        // console.log(console.log(`Paiement abonnement réussi pour ${subscription.userId}`);)
      }
    } catch (error) {
      // console.error(console.error('Erreur traitement paiement réussi:', error);)
    }
  }

  // Traiter l'échec de paiement d'abonnement
  async handleInvoicePaymentFailed(invoice) {
    const subscriptionId = invoice.subscription;
    
    try {
      const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
      
      if (subscription) {
        subscription.status = 'past_due';
        await subscription.save();
        
        // console.log(console.log(`Paiement abonnement échoué pour ${subscription.userId}`);)
      }
    } catch (error) {
      // console.error(console.error('Erreur traitement paiement échoué:', error);)
    }
  }

  // Traiter la suppression d'abonnement
  async handleSubscriptionDeleted(subscription) {
    try {
      const subscriptionDoc = await Subscription.findOne({ 
        stripeSubscriptionId: subscription.id 
      });
      
      if (subscriptionDoc) {
        subscriptionDoc.status = 'cancelled';
        await subscriptionDoc.save();
        
        // console.log(console.log(`Abonnement annulé pour ${subscriptionDoc.userId}`);)
      }
    } catch (error) {
      // console.error(console.error('Erreur traitement suppression abonnement:', error);)
    }
  }

  // Annuler un abonnement
  async cancelSubscription(userId) {
    try {
      const subscription = await Subscription.findOne({ userId });
      
      if (!subscription) {
        return { success: false, error: 'Aucun abonnement trouvé' };
      }

      // Annuler côté Stripe
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });

      // Mettre à jour en base
      subscription.cancelAtPeriodEnd = true;
      await subscription.save();

      return { success: true, message: 'Abonnement sera annulé à la fin de la période' };
    } catch (error) {
      // console.error(console.error('Erreur annulation abonnement:', error);)
      return { success: false, error: error.message };
    }
  }

  // Vérifier le statut d'un utilisateur
  async getUserStatus(userId) {
    try {
      const user = await User.findById(userId);
      const credits = await Credit.findOne({ userId });
      const subscription = await Subscription.findOne({ userId });

      return {
        hasAccount: !!user,
        emailVerified: user?.emailVerified || false,
        credits: credits?.credits || 0,
        hasSubscription: !!subscription,
        subscriptionActive: subscription?.isActive() || false,
        subscriptionEnds: subscription?.currentPeriodEnd || null,
        plan: subscription?.plan || null
      };
    } catch (error) {
      // console.error(console.error('Erreur vérification statut utilisateur:', error);)
      return { success: false, error: error.message };
    }
  }
}

module.exports = new StripeService();
