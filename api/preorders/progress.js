const supabase = require('../lib/supabase');

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
}

module.exports = async (req, res) => {
    setCORS(res);

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Compter les commandes payées avec Supabase
        const { count, error } = await supabase
            .from('preorders')
            .select('*', { count: 'exact', head: true })
            .eq('paid_status', 'completed');

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }

        const goal = parseInt(process.env.PREORDER_GOAL) || 500;
        const sold = count || 0;
        const remaining = Math.max(goal - sold, 0);
        const percent = Math.min(Math.round((sold / goal) * 100), 100);

        res.json({
            goal,
            sold,
            remaining,
            percent
        });
        
    } catch (error) {
        console.error('Error getting preorder progress:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            goal: 500,
            sold: 0,
            remaining: 500,
            percent: 0
        });
    }
};
