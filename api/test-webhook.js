// Endpoint de test pour vérifier si les API Vercel fonctionnent
// URL: https://oradia.fr/api/test-webhook

const handler = async (req, res) => {
    try {
        console.log('🧪 TEST WEBHOOK APPELÉ');
        console.log('📋 Méthode:', req.method);
        console.log('📋 Headers:', Object.keys(req.headers));
        console.log('📋 Query params:', req.query);
        
        // Variables d'environnement
        const envStatus = {
            STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? '✅' : '❌',
            STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? '✅' : '❌',
            SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '❌',
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌',
            BREVO_API_KEY: process.env.BREVO_API_KEY ? '✅' : '❌',
            BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || '❌'
        };
        
        console.log('🔍 Variables environnement:', envStatus);
        
        // Test connexion Supabase
        let supabaseTest = '❌';
        try {
            const { createClient } = require('@supabase/supabase-js');
            const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (supabaseUrl && supabaseKey) {
                const supabase = createClient(supabaseUrl, supabaseKey);
                const { count, error } = await supabase
                    .from('preorders')
                    .select('count', { count: 'exact', head: true });
                
                if (error) {
                    console.error('❌ Supabase error:', error.message);
                    supabaseTest = `❌ ${error.message}`;
                } else {
                    console.log('✅ Supabase OK, count:', count);
                    supabaseTest = `✅ ${count} précommandes`;
                }
            }
        } catch (error) {
            console.error('❌ Supabase exception:', error.message);
            supabaseTest = `❌ ${error.message}`;
        }
        
        // Test connexion Brevo
        let brevoTest = '❌';
        if (process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) {
            try {
                const response = await fetch('https://api.brevo.com/v3/account', {
                    headers: {
                        'api-key': process.env.BREVO_API_KEY
                    }
                });
                
                if (response.ok) {
                    console.log('✅ Brevo OK');
                    brevoTest = '✅ Connexion réussie';
                } else {
                    console.error('❌ Brevo error:', response.status);
                    brevoTest = `❌ ${response.status}`;
                }
            } catch (error) {
                console.error('❌ Brevo exception:', error.message);
                brevoTest = `❌ ${error.message}`;
            }
        } else {
            brevoTest = '❌ Variables manquantes';
        }
        
        const result = {
            status: '✅ Test webhook fonctionnel',
            timestamp: new Date().toISOString(),
            environment: envStatus,
            tests: {
                supabase: supabaseTest,
                brevo: brevoTest
            },
            next_steps: [
                '1. Si Supabase ❌: vérifier URL et SERVICE_ROLE_KEY dans Vercel',
                '2. Si Brevo ❌: vérifier API_KEY et SENDER_EMAIL dans Vercel',
                '3. Faire un test de paiement et vérifier les logs Vercel',
                '4. Vérifier que le webhook Stripe pointe vers: https://oradia.fr/api/stripe-webhook'
            ]
        };
        
        console.log('📊 Résultat test:', result);
        
        return res.status(200).json(result);
        
    } catch (error) {
        console.error('❌ ERREUR TEST WEBHOOK:', error);
        return res.status(500).json({
            error: 'Test webhook failed',
            message: error.message,
            stack: error.stack
        });
    }
};

module.exports = handler;
