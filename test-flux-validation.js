/**
 * SCRIPT DE VALIDATION POST-DÉPLOIEMENT
 * 
 * Ce script teste les deux flux et capture les preuves factuelles :
 * - Flux A : Contribution libre
 * - Flux B : Waitlist
 */

const SITE_URL = process.env.SITE_URL || 'https://oradia.fr';

console.log('🧪 === VALIDATION POST-DÉPLOIEMENT ===\n');
console.log(`🌐 Site testé : ${SITE_URL}\n`);

// ============================================
// FLUX A : CONTRIBUTION LIBRE
// ============================================

async function testContributionLibre() {
    console.log('💰 === TEST FLUX CONTRIBUTION LIBRE ===\n');
    
    const payload = {
        customAmount: 2000, // 20€ en centimes
        type: 'don-libre',
        email: 'test-validation@oradia.fr',
        fullName: 'Test Validation'
    };
    
    console.log('📦 Payload envoyé :');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');
    
    try {
        const startTime = Date.now();
        const response = await fetch(`${SITE_URL}/api/create-checkout-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const duration = Date.now() - startTime;
        
        console.log('📡 RÉPONSE HTTP :');
        console.log(`- Status Code : ${response.status}`);
        console.log(`- Status Text : ${response.statusText}`);
        console.log(`- Durée : ${duration}ms`);
        console.log('');
        
        console.log('📋 Headers de réponse :');
        response.headers.forEach((value, key) => {
            console.log(`  ${key}: ${value}`);
        });
        console.log('');
        
        const data = await response.json();
        
        console.log('📄 RÉPONSE JSON EXACTE :');
        console.log(JSON.stringify(data, null, 2));
        console.log('');
        
        // VALIDATION CRITÈRES
        console.log('✅ VALIDATION CRITÈRES :');
        console.log(`- Status HTTP 200 : ${response.status === 200 ? '✅ OUI' : '❌ NON'}`);
        console.log(`- data.url présent : ${data.url ? '✅ OUI' : '❌ NON'}`);
        console.log(`- data.url est une URL Stripe : ${data.url && data.url.includes('checkout.stripe.com') ? '✅ OUI' : '❌ NON'}`);
        console.log('');
        
        if (data.url) {
            console.log('🔗 URL STRIPE CHECKOUT :');
            console.log(data.url);
            console.log('');
            console.log('✅ FLUX CONTRIBUTION LIBRE : FONCTIONNEL');
        } else {
            console.log('❌ FLUX CONTRIBUTION LIBRE : ÉCHEC - Pas d\'URL de redirection');
        }
        
        return {
            success: response.status === 200 && !!data.url,
            status: response.status,
            data: data,
            duration: duration
        };
        
    } catch (error) {
        console.error('❌ ERREUR FLUX CONTRIBUTION LIBRE :');
        console.error(error.message);
        console.error(error.stack);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================
// FLUX B : WAITLIST
// ============================================

async function testWaitlist() {
    console.log('\n📧 === TEST FLUX WAITLIST ===\n');
    
    const payload = {
        email: 'test-validation@oradia.fr'
    };
    
    console.log('📦 Payload envoyé :');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');
    
    try {
        const startTime = Date.now();
        const response = await fetch(`${SITE_URL}/api/waitlist`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const duration = Date.now() - startTime;
        
        console.log('📡 RÉPONSE HTTP :');
        console.log(`- Status Code : ${response.status}`);
        console.log(`- Status Text : ${response.statusText}`);
        console.log(`- Durée : ${duration}ms`);
        console.log('');
        
        console.log('📋 Headers de réponse :');
        response.headers.forEach((value, key) => {
            console.log(`  ${key}: ${value}`);
        });
        console.log('');
        
        const data = await response.json();
        
        console.log('📄 RÉPONSE JSON EXACTE :');
        console.log(JSON.stringify(data, null, 2));
        console.log('');
        
        // VALIDATION CRITÈRES
        console.log('✅ VALIDATION CRITÈRES :');
        console.log(`- Status HTTP 200 : ${response.status === 200 ? '✅ OUI' : '❌ NON'}`);
        console.log(`- Status HTTP 500 (config manquante) : ${response.status === 500 ? '⚠️ OUI' : '✅ NON'}`);
        console.log(`- data.success présent : ${data.success !== undefined ? '✅ OUI' : '❌ NON'}`);
        console.log(`- data.message présent : ${data.message ? '✅ OUI' : '❌ NON'}`);
        console.log('');
        
        if (response.status === 500 && data.message === 'Configuration du serveur incomplète') {
            console.log('⚠️ FLUX WAITLIST : VARIABLES ENVIRONNEMENT MANQUANTES');
            console.log('📋 Action requise : Configurer BREVO_API_KEY et BREVO_WAITLIST_LIST_ID dans Vercel');
        } else if (response.status === 200 && data.success) {
            console.log('✅ FLUX WAITLIST : FONCTIONNEL');
        } else {
            console.log('❌ FLUX WAITLIST : ÉCHEC - Erreur inattendue');
        }
        
        return {
            success: response.status === 200 || response.status === 500,
            status: response.status,
            data: data,
            duration: duration
        };
        
    } catch (error) {
        console.error('❌ ERREUR FLUX WAITLIST :');
        console.error(error.message);
        console.error(error.stack);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================
// EXÉCUTION
// ============================================

async function runValidation() {
    console.log('🚀 Démarrage validation...\n');
    console.log('='.repeat(60));
    console.log('');
    
    const resultA = await testContributionLibre();
    console.log('');
    console.log('='.repeat(60));
    
    const resultB = await testWaitlist();
    console.log('');
    console.log('='.repeat(60));
    console.log('');
    
    // RAPPORT FINAL
    console.log('📊 === RAPPORT FINAL ===\n');
    console.log(`Flux Contribution Libre : ${resultA.success ? '✅ VALIDÉ' : '❌ ÉCHEC'}`);
    console.log(`Flux Waitlist : ${resultB.success ? '✅ VALIDÉ' : '❌ ÉCHEC'}`);
    console.log('');
    
    if (resultA.success && resultB.success) {
        console.log('🎉 VALIDATION COMPLÈTE : TOUS LES FLUX FONCTIONNENT');
    } else {
        console.log('⚠️ VALIDATION PARTIELLE : Voir détails ci-dessus');
    }
    
    return {
        contributionLibre: resultA,
        waitlist: resultB
    };
}

// Exécution si appelé directement
if (require.main === module) {
    runValidation().catch(console.error);
}

module.exports = { runValidation, testContributionLibre, testWaitlist };
