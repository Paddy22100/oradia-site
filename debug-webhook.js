// Script de test pour diagnostiquer le webhook
// Exécuter avec: node debug-webhook.js

console.log('🔍 DIAGNOSTIC WEBHOOK STRIPE');

// 1. Vérifier les variables d'environnement critiques
console.log('\n📋 VARIABLES ENVIRONNEMENT:');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅' : '❌ MANQUANTE');
console.log('STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? '✅' : '❌ MANQUANTE');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '❌ MANQUANTE');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌ MANQUANTE');
console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✅' : '❌ MANQUANTE');
console.log('BREVO_SENDER_EMAIL:', process.env.BREVO_SENDER_EMAIL || '❌ MANQUANT');

// 2. Tester la connexion Supabase
try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && supabaseKey) {
        console.log('\n🔌 TEST CONNEXION SUPABASE:');
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Test simple: compter les enregistrements existants
        supabase
            .from('preorders')
            .select('count', { count: 'exact', head: true })
            .then(({ count, error }) => {
                if (error) {
                    console.error('❌ Erreur connexion Supabase:', error.message);
                    console.error('❌ Code:', error.code);
                } else {
                    console.log('✅ Connexion Supabase réussie');
                    console.log('📊 Nombre total de précommandes:', count);
                }
            });
    } else {
        console.log('\n❌ Impossible de tester Supabase - variables manquantes');
    }
} catch (error) {
    console.error('\n❌ Erreur import Supabase:', error.message);
}

// 3. Tester la connexion Brevo
if (process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) {
    console.log('\n📧 TEST CONNEXION BREVO:');
    
    fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
            sender: {
                email: process.env.BREVO_SENDER_EMAIL,
                name: 'ORADIA Test'
            },
            to: [{
                email: 'test@oradia.fr',  // Email de test
                name: 'Test Webhook'
            }],
            subject: '🧪 Test Webhook ORADIA',
            htmlContent: '<p>Ceci est un test de diagnostic du webhook.</p>'
        })
    })
    .then(response => {
        if (response.ok) {
            console.log('✅ Connexion Brevo réussie');
            return response.json();
        } else {
            console.error('❌ Erreur Brevo:', response.status, response.statusText);
            return response.text().then(text => console.error('❌ Détails:', text));
        }
    })
    .then(result => {
        if (result.messageId) {
            console.log('✅ Email test envoyé:', result.messageId);
        }
    })
    .catch(error => {
        console.error('❌ Erreur test Brevo:', error.message);
    });
} else {
    console.log('\n❌ Impossible de tester Brevo - variables manquantes');
}

// 4. Instructions pour l'utilisateur
console.log('\n📋 INSTRUCTIONS:');
console.log('1. Exécuter: node debug-webhook.js');
console.log('2. Vérifier que toutes les variables sont ✅');
console.log('3. Si erreur Supabase: vérifier URL et SERVICE_ROLE_KEY');
console.log('4. Si erreur Brevo: vérifier API_KEY et SENDER_EMAIL');
console.log('5. Faire un test de paiement et vérifier les logs Vercel');
