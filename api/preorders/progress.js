const { createClient } = require('@supabase/supabase-js');

// Variables d'environnement avec fallbacks
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Logs de diagnostic
console.log('[supabase] url exact:', supabaseUrl);
console.log('[supabase] service role exists:', !!supabaseKey);

// Création directe du client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Validation des variables d'environnement critiques
function validateEnvironment() {
    const requiredVars = [
        'SUPABASE_URL', 
        'SUPABASE_SERVICE_ROLE_KEY', 
        'PREORDER_GOAL'
    ];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        console.error('[progress] Missing environment variables:', missing);
        console.error('[progress] Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
        throw new Error(`Configuration error: Missing ${missing.join(', ')}`);
    }
}

// CORS helper
function setCORS(req, res) {
    const allowedOrigins = [
        'https://oradia.fr', 
        'https://www.oradia.fr',
        'https://oradia-site-trail.vercel.app',
        'https://oradia.vercel.app'
    ];
    const origin = req.headers?.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
}

module.exports = async (req, res) => {
    try {
        setCORS(req, res);
        
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Validation environnement au début
        validateEnvironment();
        
        console.log('=== PREORDER PROGRESS API START ===');
        console.log('[progress] supabase client created');
        console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
        console.log('Fetching preorder progress...');
        
        // Test brut de connexion HTTP vers Supabase
        console.log('[test] direct fetch to supabase');

        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/preorders?select=stripe_session_id&limit=1`, {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}` 
            }
          });

          console.log('[test] fetch status:', response.status);

          const text = await response.text();
          console.log('[test] fetch response:', text);

        } catch (err) {
          console.error('[test] fetch error:', err);
          throw new Error(`Direct fetch test failed: ${err.message}`);
        }
        
        // Compter les commandes payées avec Supabase
        console.log('[progress] before query - counting completed orders');
        const { count, error } = await supabase
            .from('preorders')
            .select('*', { count: 'exact', head: true })
            .eq('paid_status', 'completed');
        console.log('[progress] after query - count retrieved');

        if (error) {
            console.error('[progress] query error:', error);
            console.error('[progress] exact error.message:', error.message);
            console.error('[progress] exact error.stack:', error.stack);
            throw new Error(`Database error: ${error.message}`);
        }

        const goal = parseInt(process.env.PREORDER_GOAL) || 500;
        const sold = count || 0;
        const remaining = Math.max(goal - sold, 0);
        const percent = Math.min(Math.round((sold / goal) * 100), 100);

        console.log(`Progress: ${sold}/${goal} (${percent}%)`);

        res.json({
            success: true,
            goal,
            sold,
            remaining,
            percent
        });
        
    } catch (error) {
        console.error('Error in preorder progress API:', error);
        
        // Toujours renvoyer du JSON, même en cas d'erreur
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: error.message || 'Failed to load preorder progress',
            goal: 500,
            sold: 0,
            remaining: 500,
            percent: 0
        });
    }
};
