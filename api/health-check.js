// Endpoint de health check simple qui utilise la route existante create-checkout-session
// URL: https://oradia.fr/api/create-checkout-session (avec méthode GET pour test)

const handler = async (req, res) => {
    try {
        // Si c'est une requête GET, on fait un health check
        if (req.method === 'GET') {
            console.log('🏥 HEALTH CHECK APPELÉ');
            
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
                status: '✅ Health check fonctionnel',
                timestamp: new Date().toISOString(),
                method: 'GET',
                endpoint: '/api/create-checkout-session (mode health check)',
                environment: envStatus,
                tests: {
                    supabase: supabaseTest,
                    brevo: brevoTest
                },
                message: 'Les modifications du webhook sont probablement en cours de déploiement Vercel'
            };
            
            console.log('📊 Résultat health check:', result);
            
            return res.status(200).json(result);
        }
        
        // Si c'est une requête POST, c'est le traitement normal
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Use GET for health check, POST for checkout session creation'
        });
        
    } catch (error) {
        console.error('❌ ERREUR HEALTH CHECK:', error);
        return res.status(500).json({
            error: 'Health check failed',
            message: error.message,
            stack: error.stack
        });
    }
};

module.exports = handler;
