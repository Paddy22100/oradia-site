// Script de test après correction du webhook
// Simule les données exactes reçues de Stripe

const testData = {
    "id": "evt_test_fix",
    "object": "event", 
    "data": {
        "object": {
            "id": "cs_test_b1YnvxdBba9ZzCbuthYSkoEk79B5pmH7kcEzRxbYIZul8sOpAOeapBloHU",
            "customer_details": {
                "email": "boucheron.r89@gmail.com",
                "name": "boucheron"
            },
            "metadata": {
                "offer": "guidance-incluse",
                "items": "[{\"offer\":\"guidance-incluse\",\"quantity\":1}]",
                "email": "boucheron.r89@gmail.com",
                "full_name": "Rudy BOUCHERON",
                "total_amount": "5549"
            },
            "amount_total": 5549,
            "currency": "eur",
            "payment_intent": "pi_test",
            "customer": null
        }
    }
};

console.log('🧪 TEST DONNÉES WEBHOOK APRÈS CORRECTION');
console.log('📋 Session ID:', testData.data.object.id);
console.log('📧 Email client:', testData.data.object.customer_details?.email);
console.log('🎯 Offer depuis metadata:', testData.data.object.metadata?.offer);
console.log('📦 Items:', testData.data.object.metadata?.items);
console.log('💰 Montant:', testData.data.object.amount_total / 100, '€');

// Test parsing des items (comme dans le webhook)
try {
    const items = JSON.parse(testData.data.object.metadata?.items || '[]');
    const offerFromItems = items[0]?.offer || null;
    console.log('✅ Offer depuis items parsés:', offerFromItems);
    
    // Test fallback logic
    const finalOffer = testData.data.object.metadata?.offer || offerFromItems;
    console.log('🎯 Offer final (avec fallback):', finalOffer);
    
    if (finalOffer === 'guidance-incluse') {
        console.log('✅ SUCCÈS: L\'offer est correctement extraite !');
    } else {
        console.log('❌ PROBLÈME: L\'offer n\'est pas correcte');
    }
} catch (error) {
    console.error('❌ Erreur parsing items:', error.message);
}

console.log('\n📋 PROCHAINES ÉTAPES:');
console.log('1. Déployer les corrections sur Vercel');
console.log('2. Tester: https://oradia.fr/api/test-webhook');
console.log('3. Faire un nouveau paiement test');
console.log('4. Vérifier les logs Vercel pour voir les nouveaux logs détaillés');
