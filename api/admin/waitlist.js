const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Middleware pour vérifier l'auth admin
async function requireAdminAuth(req, res) {
    const cookies = req.headers.cookie ? require('cookie').parse(req.headers.cookie) : {};
    const token = cookies.oradia_admin_session;
    
    if (!token) {
        return false;
    }
    
    try {
        const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
        return decoded.type === 'admin';
    } catch (error) {
        return false;
    }
}

export default async function handler(req, res) {
    // Seulement les requêtes GET
    if (req.method !== 'GET') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    // Vérifier l'authentification admin
    const isAdmin = await requireAdminAuth(req, res);
    if (!isAdmin) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Session admin requise' 
        });
    }

    try {
        const { page = 1, limit = 50, synced, startDate, endDate } = req.query;
        
        // Initialiser Supabase côté serveur
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        let query = supabase
            .from('waitlist_tirages')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });
        
        // Filtres
        if (synced !== undefined) {
            query = query.eq('brevo_synced', synced === 'true');
        }
        
        if (startDate) {
            query = query.gte('created_at', startDate);
        }
        
        if (endDate) {
            query = query.lte('created_at', endDate);
        }
        
        // Pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to);
        
        const { data, error, count } = await query;
        
        if (error) throw error;
        
        res.json({
            success: true,
            data: data || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur waitlist:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur lors de la récupération de la waitlist'
        });
    }
}
