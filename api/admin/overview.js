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
        // Initialiser Supabase côté serveur
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // KPI Précommandes (uniquement les completed)
        const { data: preorders, error: preordersError } = await supabase
            .from('preorders')
            .select('amount_total, created_at, email')
            .eq('paid_status', 'completed');
            
        if (preordersError) throw preordersError;
        
        const preordersCount = preorders.length;
        // amount_total est déjà en euros
        const preordersTotal = preorders.reduce((sum, p) => sum + Number(p.amount_total || 0), 0);
        const preordersNoEmail = preorders.filter(p => !p.email).length;
        
        // KPI Dons (uniquement les completed)
        const { data: donors, error: donorsError } = await supabase
            .from('donors')
            .select('amount_total, created_at, email')
            .eq('paid_status', 'completed');
            
        if (donorsError) throw donorsError;
        
        const donorsCount = donors.length;
        // amount_total est déjà en euros
        const donorsTotal = donors.reduce((sum, d) => sum + Number(d.amount_total || 0), 0);
        const donorsNoEmail = donors.filter(d => !d.email).length;
        
        // KPI Waitlist
        const { data: waitlist, error: waitlistError } = await supabase
            .from('waitlist_tirages')
            .select('created_at, brevo_synced');
            
        if (waitlistError) throw waitlistError;
        
        const waitlistCount = waitlist.length;
        const waitlistNotSynced = waitlist.filter(w => !w.brevo_synced).length;
        
        // Total global
        const globalTotal = preordersTotal + donorsTotal;
        const totalContacts = preordersCount + donorsCount + waitlistCount;
        
        res.json({
            success: true,
            data: {
                preorders: {
                    count: preordersCount,
                    total: Math.round(preordersTotal * 100) / 100, // 2 décimales
                    noEmail: preordersNoEmail
                },
                donors: {
                    count: donorsCount,
                    total: Math.round(donorsTotal * 100) / 100,
                    noEmail: donorsNoEmail
                },
                waitlist: {
                    count: waitlistCount,
                    notSynced: waitlistNotSynced
                },
                global: {
                    total: Math.round(globalTotal * 100) / 100,
                    totalContacts: totalContacts
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur overview:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur lors de la récupération des KPI'
        });
    }
}
