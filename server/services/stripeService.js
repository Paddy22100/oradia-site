const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Credit, Subscription } = require('../models/Freemium');
const User = require('../models/User');

class StripeService {
  constructor() {
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
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

  // Traiter la complétion de session checkout
  async handleCheckoutSessionCompleted(session) {
    const { userId, productType, credits } = session.metadata;
    
    if (productType === 'traversee') {
      // Ajouter les crédits de Traversée
      await this.addTraverseeCredits(userId, credits, session.id, session.amount_total / 100);
    } else if (productType === 'tore') {
      // Créer/mettre à jour l'abonnement Tore
      await this.createToreSubscription(userId, session.customer, session.subscription);
    }
  }

  // Ajouter des crédits Traversée
  async addTraverseeCredits(userId, creditsCount, paymentId, amount) {
    try {
      let credit = await Credit.findOne({ userId });
      
      if (!credit) {
        credit = new Credit({ userId });
      }

      await credit.addCredits(parseInt(creditsCount), paymentId, amount);
      
      // console.log(console.log(`Crédits ajoutés: ${creditsCount} pour utilisateur ${userId}`);)
      return { success: true, credits: credit.credits };
    } catch (error) {
      // console.error(console.error('Erreur ajout crédits:', error);)
      return { success: false, error: error.message };
    }
  }

  // Créer un abonnement Tore
  async createToreSubscription(userId, stripeCustomerId, stripeSubscriptionId) {
    try {
      // Récupérer les détails de l'abonnement depuis Stripe
      const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      
      let subscriptionDoc = await Subscription.findOne({ userId });
      
      if (!subscriptionDoc) {
        subscriptionDoc = new Subscription({
          userId,
          stripeCustomerId,
          stripeSubscriptionId
        });
      }

      subscriptionDoc.status = subscription.status;
      subscriptionDoc.currentPeriodStart = new Date(subscription.current_period_start * 1000);
      subscriptionDoc.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      subscriptionDoc.cancelAtPeriodEnd = subscription.cancel_at_period_end;

      await subscriptionDoc.save();
      
      // console.log(console.log(`Abonnement Tore créé/mis à jour pour utilisateur ${userId}`);)
      return { success: true, subscription: subscriptionDoc };
    } catch (error) {
      // console.error(console.error('Erreur création abonnement:', error);)
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
