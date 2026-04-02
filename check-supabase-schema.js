// Vérification de la structure exacte de la table Supabase preorders
// Pour identifier les colonnes manquantes ou incorrectes

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables Supabase manquantes');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSupabaseSchema() {
    try {
        console.log('🔍 VÉRIFICATION SCHÉMA TABLE PREORDERS');
        
        // 1. Vérifier si la table existe
        console.log('\n📋 1. EXISTENCE DE LA TABLE');
        const { data: tableInfo, error: tableError } = await supabase
            .rpc('get_table_info', { table_name: 'preorders' })
            .single();
            
        if (tableError) {
            console.log('⚠️ get_table_info non disponible, utilisation de information_schema');
            
            // Alternative: requête directe sur information_schema
            const { data: columns, error: columnsError } = await supabase
                .from('information_schema.columns')
                .select('column_name, data_type, is_nullable, column_default')
                .eq('table_name', 'preorders')
                .eq('table_schema', 'public')
                .order('ordinal_position');
                
            if (columnsError) {
                console.error('❌ Erreur vérification table:', columnsError);
                return;
            }
            
            console.log('✅ Table preorders trouvée');
            console.log('📊 Colonnes de la table:');
            columns.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
            });
            
            // 2. Vérifier les contraintes
            console.log('\n📋 2. CONTRAINTES DE LA TABLE');
            const { data: constraints, error: constraintsError } = await supabase
                .from('information_schema.table_constraints')
                .select('constraint_name, constraint_type')
                .eq('table_name', 'preorders')
                .eq('table_schema', 'public');
                
            if (constraintsError) {
                console.error('❌ Erreur contraintes:', constraintsError);
            } else {
                console.log('🔒 Contraintes trouvées:');
                constraints.forEach(constraint => {
                    console.log(`  - ${constraint.constraint_name}: ${constraint.constraint_type}`);
                });
            }
            
            // 3. Vérifier la contrainte UNIQUE sur stripe_session_id
            console.log('\n📋 3. CONTRAINTE UNIQUE stripe_session_id');
            const { data: uniqueConstraints, error: uniqueError } = await supabase
                .from('information_schema.key_column_usage')
                .select('constraint_name')
                .eq('table_name', 'preorders')
                .eq('table_schema', 'public')
                .eq('column_name', 'stripe_session_id');
                
            if (uniqueError) {
                console.error('❌ Erreur vérification unique:', uniqueError);
            } else {
                if (uniqueConstraints.length > 0) {
                    console.log('✅ Contrainte UNIQUE trouvée sur stripe_session_id:');
                    uniqueConstraints.forEach(uc => {
                        console.log(`  - ${uc.constraint_name}`);
                    });
                } else {
                    console.log('❌ AUCUNE CONTRAINTE UNIQUE TROUVÉE sur stripe_session_id');
                    console.log('💡 CECI EST PROBABLEMENT LE PROBLÈME !');
                    console.log('💡 onConflict: "stripe_session_id" nécessite une contrainte UNIQUE');
                }
            }
            
            // 4. Colonnes requises par le webhook
            console.log('\n📋 4. VÉRIFICATION COLONNES REQUISES PAR WEBHOOK');
            const requiredColumns = [
                'stripe_session_id',
                'email', 
                'offer',
                'full_name',
                'amount_total',
                'currency',
                'payment_intent_id',
                'stripe_customer_id',
                'paid_status',
                'shipping_address',
                'postal_code',
                'city',
                'phone',
                'updated_at'
            ];
            
            const existingColumns = columns.map(col => col.column_name);
            
            console.log('🔍 Colonnes requises vs existantes:');
            requiredColumns.forEach(col => {
                const exists = existingColumns.includes(col);
                const type = columns.find(c => c.column_name === col)?.data_type || 'N/A';
                console.log(`  - ${col}: ${exists ? '✅' : '❌'} (${type})`);
                
                if (!exists) {
                    console.error(`❌ COLONNE MANQUANTE: ${col}`);
                }
            });
            
            // 5. Test d'insertion simple
            console.log('\n📋 5. TEST D\'INSERTION SIMPLE');
            const testData = {
                stripe_session_id: `cs_test_schema_${Date.now()}`,
                email: 'test@schema.oradia.fr',
                offer: 'test-schema',
                full_name: 'Test Schema',
                amount_total: 1.00,
                currency: 'eur',
                payment_intent_id: null,
                stripe_customer_id: null,
                paid_status: 'test',
                shipping_address: null,
                postal_code: null,
                city: null,
                phone: null,
                updated_at: new Date().toISOString()
            };
            
            console.log('📦 Données de test:', JSON.stringify(testData, null, 2));
            
            const { data: insertData, error: insertError } = await supabase
                .from('preorders')
                .insert(testData)
                .select();
                
            if (insertError) {
                console.error('❌ ERREUR INSERTION TEST:');
                console.error('  - Code:', insertError.code);
                console.error('  - Message:', insertError.message);
                console.error('  - Details:', insertError.details);
                console.error('  - Full error:', JSON.stringify(insertError, null, 2));
                
                if (insertError.code === '42703') {
                    console.error('💡 COLONNE INEXISTANTE: Vérifier les noms de colonnes ci-dessus');
                } else if (insertError.code === '23502') {
                    console.error('💡 COLONNE REQUISE MANQUANTE: NOT NULL violation');
                }
            } else {
                console.log('✅ Insertion test réussie:', insertData);
                
                // Nettoyer le test
                await supabase
                    .from('preorders')
                    .delete()
                    .eq('stripe_session_id', testData.stripe_session_id);
                console.log('🧹 Test nettoyé');
            }
            
        } else {
            console.log('✅ Info table:', tableInfo);
        }
        
    } catch (error) {
        console.error('❌ ERREUR GLOBALE:', error);
    }
}

checkSupabaseSchema();
