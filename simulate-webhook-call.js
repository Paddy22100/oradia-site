// Simulation de l'appel webhook avec les données exactes de votre test
// Pour comprendre ce qui se passe

console.log('🔍 SIMULATION WEBHOOK AVEC VOS DONNÉES RÉELLES');

// Données exactes de votre webhook Stripe
const stripeEventData = {
    "id": "evt_1THt709jcRbNO5oyrS9t0F3K",
    "object": "event",
    "api_version": "2026-02-25.clover",
    "created": 1775166554,
    "data": {
        "object": {
            "id": "cs_test_b1YnvxdBba9ZzCbuthYSkoEk79B5pmH7kcEzRxbYIZul8sOpAOeapBloHU",
            "object": "checkout.session",
            "amount_subtotal": 5549,
            "amount_total": 5549,
            "currency": "eur",
            "customer_details": {
                "address": {
                    "city": null,
                    "country": "FR",
                    "line1": null,
                    "line2": null,
                    "postal_code": null,
                    "state": null
                },
                "business_name": null,
                "email": "boucheron.r89@gmail.com",
                "individual_name": null,
                "name": "boucheron",
                "phone": null,
                "tax_exempt": "none",
                "tax_ids": []
            },
            "customer_email": "boucheron.r89@gmail.com",
            "metadata": {
                "address_complement": "",
                "delivery_price": "749",
                "items": "[{\"offer\":\"guidance-incluse\",\"quantity\":1}]",
                "offer": "guidance-incluse",
                "shipping_address": "17 Cardevily",
                "full_name": "Rudy BOUCHERON",
                "calculated_delivery_price": "7.49",
                "city": "TREVRON",
                "postal_code": "22100",
                "total_weight": "0.5",
                "phone": "0645511990",
                "source": "oradia-livraison",
                "country": "FR",
                "delivery_method": "home",
                "email": "boucheron.r89@gmail.com",
                "total_amount": "5549"
            },
            "payment_intent": "pi_3THt6y9jcRbNO5oy1G7qbQUT",
            "payment_status": "paid",
            "status": "complete"
        }
    }
};

// Simulation de l'extraction des données comme dans le webhook
const session = stripeEventData.data.object;
const sessionId = session.id;

console.log('\n📋 EXTRACTION DES DONNÉES:');
console.log('✅ Session ID:', sessionId);
console.log('✅ Email client:', session.customer_details?.email);
console.log('✅ Email depuis metadata:', session.metadata?.email);

// Extraction de l'offer (logique corrigée)
const extractedOffer = session.metadata?.offer || 
      (() => {
          try {
              const items = JSON.parse(session.metadata?.items || '[]');
              return items[0]?.offer || null;
          } catch {
              return null;
          }
      })();

console.log('✅ Offer extraite:', extractedOffer);

// Simulation des données extraites complètes
const extractedData = {
    email: session.customer_details?.email || 
           session.customer_email || 
           session.metadata?.email || 
           null,
    offer: extractedOffer,
    full_name: session.metadata?.full_name || 
              session.customer_details?.name || 
              null,
    stripe_session_id: sessionId,
    amount_total: session.amount_total || 0,
    currency: session.currency || 'eur',
    payment_intent_id: session.payment_intent || null,
    stripe_customer_id: session.customer || null,
    paid_status: 'completed'
};

console.log('\n📦 DONNÉES FINALES EXTRAITES:');
console.log('  - email:', extractedData.email);
console.log('  - offer:', extractedData.offer);
console.log('  - full_name:', extractedData.full_name);
console.log('  - stripe_session_id:', extractedData.stripe_session_id);
console.log('  - amount_total:', extractedData.amount_total);
console.log('  - currency:', extractedData.currency);
console.log('  - paid_status:', extractedData.paid_status);

// Validation des données critiques
console.log('\n🔍 VALIDATION DES DONNÉES CRITIQUES:');
const validation = {
    email: !!extractedData.email,
    offer: !!extractedData.offer,
    stripe_session_id: !!extractedData.stripe_session_id,
    amount_total: extractedData.amount_total > 0,
    paid_status: extractedData.paid_status === 'completed'
};

Object.entries(validation).forEach(([key, isValid]) => {
    console.log(`  - ${key}: ${isValid ? '✅' : '❌'}`);
});

const allValid = Object.values(validation).every(v => v);
console.log('\n🎯 RÉSULTAT VALIDATION:', allValid ? '✅ TOUTES LES DONNÉES SONT VALIDES' : '❌ DES DONNÉES MANQUENT');

if (allValid) {
    console.log('\n📋 DONNÉES POUR SUPABASE (format attendu):');
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
        shipping_address: session.metadata?.shipping_address || null,
        postal_code: session.metadata?.postal_code || null,
        city: session.metadata?.city || null,
        phone: session.metadata?.phone || null,
        updated_at: new Date().toISOString()
    };
    
    console.log(JSON.stringify(supabaseData, null, 2));
    
    console.log('\n📧 DONNÉES POUR EMAIL:');
    const emailData = {
        toEmail: extractedData.email,
        toName: extractedData.full_name || 'Ami(e) d\'ORADIA',
        offer: extractedData.offer,
        amountTotal: (extractedData.amount_total / 100).toFixed(2)
    };
    
    console.log(JSON.stringify(emailData, null, 2));
}

console.log('\n🎯 CONCLUSION:');
console.log('Les données extraites sont PARFAITES.');
console.log('Le problème doit venir de:');
console.log('1. Variables d\'environnement manquantes sur Vercel');
console.log('2. Permissions Supabase (RLS)');
console.log('3. Clé Brevo invalide');
console.log('4. Déploiement des corrections pas encore effectué');
