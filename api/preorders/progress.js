const { createClient } = require('@supabase/supabase-js');

// Création directe du client Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Validation des variables d'environnement critiques
function validateEnvironment() {
    const requiredVars = [
        'NEXT_PUBLIC_SUPABASE_URL', 
        'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
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
function setCORS(res) {
    const allowedOrigins = [
        'https://oradia.fr', 
        'https://www.oradia.fr',
        'https://oradia-site-trail.vercel.app',
        'https://oradia.vercel.app'
    ];
    const origin = res.req?.headers?.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
}

module.exports = async (req, res) => {
    try {
        setCORS(res);
        
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Validation environnement au début
        validateEnvironment();
        
        console.log('=== PREORDER PROGRESS API START ===');
        console.log('[progress] supabase client created');
        console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
        console.log('Fetching preorder progress...');
        
        // Compter les commandes payées avec Supabase
        console.log('[progress] before query - counting completed orders');
        const { count, error } = await supabase
            .from('preorders')
            .select('*', { count: 'exact', head: true })
            .eq('paid_status', 'completed');
        console.log('[progress] after query - count retrieved');

        if (error) {
            console.error('[progress] query error:', error);
            console.error('[progress] error details:', JSON.stringify(error, null, 2));
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
