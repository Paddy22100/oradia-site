const { createClient } = require('@supabase/supabase-js');
const { verifyAdminAuth } = require('./_auth');

// Variables d'environnement
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        verifyAdminAuth(req);
        const { section, page = 1, limit = 10 } = req.query;
        
        // Validation du paramètre section
        const validSections = ['overview', 'preorders', 'donors', 'waitlist'];
        if (!section || !validSections.includes(section)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Section invalide. Sections valides: ' + validSections.join(', ')
            });
        }

        let result;

        switch (section) {
            case 'overview':
                result = await getOverview();
                break;
            case 'preorders':
                result = await getPreorders(page, limit);
                break;
            case 'donors':
                result = await getDonors(page, limit);
                break;
            case 'waitlist':
                result = await getWaitlist(page, limit);
                break;
        }

        res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination || null
        });

    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? 'Unauthorized' : 'Internal Server Error',
            message: error.message || 'Erreur serveur lors de la récupération des données'
        });
    }
}

// Overview - KPI et statistiques
async function getOverview() {
    try {
        // Précommandes
        const { data: preorders, error: preordersError } = await supabase
            .from('preorders')
            .select('amount_total, email, paid_status, created_at')
            .eq('paid_status', 'completed');

        // Dons
        const { data: donors, error: donorsError } = await supabase
            .from('donors')
            .select('amount_total, email, paid_status, created_at')
            .eq('paid_status', 'completed');

        // Waitlist
        const { data: waitlist, error: waitlistError } = await supabase
            .from('waitlist_tirages')
            .select('email, brevo_synced, created_at');

        if (preordersError || donorsError || waitlistError) {
            throw new Error('Erreur lors de la récupération des données');
        }

        // Calculs
        const preordersCount = preorders?.length || 0;
        const preordersTotal = preorders?.reduce((sum, p) => sum + Number(p.amount_total || 0), 0) || 0;
        const preordersNoEmail = preorders?.filter(p => !p.email).length || 0;

        const donorsCount = donors?.length || 0;
        const donorsTotal = donors?.reduce((sum, d) => sum + Number(d.amount_total || 0), 0) || 0;
        const donorsNoEmail = donors?.filter(d => !d.email).length || 0;

        const waitlistCount = waitlist?.length || 0;
        const waitlistNotSynced = waitlist?.filter(w => !w.brevo_synced).length || 0;

        const globalTotal = preordersTotal + donorsTotal;
        const totalContacts = preordersCount + donorsCount + waitlistCount;

        return {
            data: {
                preorders: {
                    count: preordersCount,
                    total: Math.round(preordersTotal * 100) / 100,
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
                    totalContacts
                }
            }
        };
    } catch (error) {
        throw new Error('Erreur overview: ' + error.message);
    }
}

// Précommandes avec pagination
async function getPreorders(page, limit) {
    try {
        const offset = (page - 1) * limit;
        
        const { data, error, count } = await supabase
            .from('preorders')
            .select('*', { count: 'exact' })
            .eq('paid_status', 'completed')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return {
            data: data || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / limit)
            }
        };
    } catch (error) {
        throw new Error('Erreur précommandes: ' + error.message);
    }
}

// Dons avec pagination
async function getDonors(page, limit) {
    try {
        const offset = (page - 1) * limit;
        
        const { data, error, count } = await supabase
            .from('donors')
            .select('*', { count: 'exact' })
            .eq('paid_status', 'completed')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return {
            data: data || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / limit)
            }
        };
    } catch (error) {
        throw new Error('Erreur dons: ' + error.message);
    }
}

// Waitlist avec pagination
async function getWaitlist(page, limit) {
    try {
        const offset = (page - 1) * limit;
        
        const { data, error, count } = await supabase
            .from('waitlist_tirages')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return {
            data: data || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / limit)
            }
        };
    } catch (error) {
        throw new Error('Erreur waitlist: ' + error.message);
    }
}
