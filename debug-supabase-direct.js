// Test direct de connexion Supabase avec les mêmes variables que le webhook
// Pour isoler le problème

console.log('🔍 TEST DIRECT CONNEXION SUPABASE');

// Variables exactes du webhook
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('📋 Configuration:');
console.log('  - URL:', supabaseUrl);
console.log('  - Key présente:', !!supabaseKey);
console.log('  - Key longueur:', supabaseKey ? supabaseKey.length : 0);

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables manquantes');
    process.exit(1);
}

// Test avec le client Supabase
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabaseConnection() {
    try {
        console.log('\n🔌 Test 1: Connexion simple');
        
        // Test de connexion avec count
        const { count, error: countError } = await supabase
            .from('preorders')
            .select('count', { count: 'exact', head: true });
        
        if (countError) {
            console.error('❌ Erreur count:', countError);
            console.error('  - Code:', countError.code);
            console.error('  - Message:', countError.message);
            console.error('  - Details:', countError.details);
            return;
        }
        
        console.log('✅ Connexion réussie');
        console.log('  - Nombre précommandes actuelles:', count);
        
        console.log('\n🔌 Test 2: Lecture des données');
        
        // Test de lecture des données existantes
        const { data: existingData, error: readError } = await supabase
            .from('preorders')
            .select('*')
            .limit(5)
            .order('created_at', { ascending: false });
        
        if (readError) {
            console.error('❌ Erreur lecture:', readError);
            return;
        }
        
        console.log('✅ Lecture réussie');
        console.log('  - Données existantes:', existingData.length);
        existingData.forEach((row, i) => {
            console.log(`    ${i+1}. ID: ${row.id}, Email: ${row.email}, Session: ${row.stripe_session_id}`);
        });
        
        console.log('\n🔌 Test 3: Insertion test (similaire au webhook)');
        
        // Données de test exactement comme dans le webhook
        const testData = {
            stripe_session_id: `cs_test_${Date.now()}`,
            email: 'test@oradia.fr',
            offer: 'guidance-incluse',
            full_name: 'Test Webhook',
            amount_total: 55.49,
            currency: 'eur',
            payment_intent_id: `pi_test_${Date.now()}`,
            stripe_customer_id: null,
            paid_status: 'completed',
            shipping_address: '17 Test Street',
            postal_code: '22100',
            city: 'TESTVILLE',
            phone: '0612345678',
            updated_at: new Date().toISOString()
        };
        
        console.log('  - Données à insérer:', JSON.stringify(testData, null, 2));
        
        // Test d'insertion
        const { data: insertData, error: insertError } = await supabase
            .from('preorders')
            .insert(testData)
            .select();
        
        if (insertError) {
            console.error('❌ Erreur insertion:', insertError);
            console.error('  - Code:', insertError.code);
            console.error('  - Message:', insertError.message);
            console.error('  - Details:', insertError.details);
            console.error('  - Hint:', insertError.hint);
            
            // Analyse des erreurs communes
            if (insertError.code === '23505') {
                console.error('💡 CONFLICT: Probablement duplicate key');
            } else if (insertError.code === '23502') {
                console.error('💡 NOT NULL: Champ requis manquant');
            } else if (insertError.code === '42501') {
                console.error('💡 PERMISSION: Problème RLS');
            } else if (insertError.code === '42P01') {
                console.error('💡 TABLE: Table preorders n\'existe pas');
            }
            
            return;
        }
        
        console.log('✅ Insertion réussie');
        console.log('  - Données insérées:', insertData);
        
        console.log('\n🔌 Test 4: Upsert (comme le webhook)');
        
        // Test upsert avec conflit
        const { data: upsertData, error: upsertError } = await supabase
            .from('preorders')
            .upsert({
                ...testData,
                stripe_session_id: `cs_test_upsert_${Date.now()}`,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'stripe_session_id',
                ignoreDuplicates: false
            })
            .select();
        
        if (upsertError) {
            console.error('❌ Erreur upsert:', upsertError);
            console.error('  - Code:', upsertError.code);
            console.error('  - Message:', upsertError.message);
            return;
        }
        
        console.log('✅ Upsert réussi');
        console.log('  - Données upsert:', upsertData);
        
        console.log('\n🎯 CONCLUSION:');
        console.log('Si tous les tests passent ✅, le problème vient du webhook Stripe.');
        console.log('Si un test échoue ❌, le problème vient de Supabase.');
        
    } catch (error) {
        console.error('❌ ERREUR GLOBALE:', error);
        console.error('  - Message:', error.message);
        console.error('  - Stack:', error.stack);
    }
}

testSupabaseConnection();
