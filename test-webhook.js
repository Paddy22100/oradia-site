#!/usr/bin/env node

/**
 * Script de test pour webhook Stripe
 * Utilisez ce script pour tester la réception des webhooks
 */

const crypto = require('crypto');
const https = require('https');

// Configuration
const WEBHOOK_URL = 'http://localhost:3001/api/payments/webhook'; // URL locale
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_your_webhook_secret';

// Événement de test (checkout.session.completed)
const testEvent = {
  id: "evt_test_123456789",
  object: "event",
  api_version: "2026-02-25.clover",
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: "cs_test_a1rljLOboVWRX7SdhfwKoOmAD723v5xL2WHwwasUEw16WQjg1dbSWekNM8",
      object: "checkout.session",
      amount_total: 800,
      amount_subtotal: 800,
      currency: "eur",
      customer: "cus_test_customer",
      customer_details: {
        address: {
          city: null,
          country: "FR",
          line1: null,
          line2: null,
          postal_code: null,
          state: null
        },
        business_name: null,
        email: "test@example.com",
        individual_name: null,
        name: "Test User",
        phone: null,
        tax_exempt: "none",
        tax_ids: []
      },
      customer_email: "test@example.com",
      metadata: {
        full_name: "Test User",
        email: "test@example.com",
        offer: "tore-subscription"
      },
      mode: "subscription",
      payment_status: "paid",
      status: "complete",
      subscription: "sub_test_subscription",
      success_url: "https://oradia.fr/success-tore.html?session_id={CHECKOUT_SESSION_ID}",
      total_details: {
        amount_discount: 0,
        amount_shipping: 0,
        amount_tax: 0
      }
    }
  },
  livemode: false,
  type: "checkout.session.completed",
  pending_webhooks: 1
};

function signWebhook(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  
  return `t=${timestamp},v1=${signature}`;
}

function testWebhook() {
  console.log('🧪 Test du webhook Stripe...');
  console.log('📤 Événement:', testEvent.type);
  console.log('📦 Payload:', JSON.stringify(testEvent, null, 2));
  
  // Signer le payload
  const signature = signWebhook(testEvent, WEBHOOK_SECRET);
  console.log('🔐 Signature:', signature);
  
  // Préparer la requête
  const postData = JSON.stringify(testEvent);
  
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/payments/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': signature,
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = https.request(options, (res) => {
    console.log(`📊 Status Code: ${res.statusCode}`);
    console.log(`📋 Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('📝 Response:', data);
      
      if (res.statusCode === 200) {
        console.log('✅ Webhook traité avec succès!');
      } else {
        console.log('❌ Erreur lors du traitement du webhook');
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('💥 Erreur de requête:', error);
  });
  
  // Envoyer les données
  req.write(postData);
  req.end();
}

// Instructions d'utilisation
console.log('🔧 Configuration du test webhook:');
console.log('1. Assurez-vous que votre serveur tourne sur localhost:3001');
console.log('2. Définissez la variable d\'environnement STRIPE_WEBHOOK_SECRET');
console.log('3. Lancez ce script: node test-webhook.js');
console.log('');

testWebhook();
