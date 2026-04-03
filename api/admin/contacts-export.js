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

        // Récupérer toutes les données
        const [preordersResult, donorsResult, waitlistResult] = await Promise.all([
            supabase.from('preorders').select('email, full_name, created_at'),
            supabase.from('donors').select('email, full_name, created_at'),
            supabase.from('waitlist_tirages').select('email, full_name, created_at')
        ]);
        
        // Consolider les contacts
        const contacts = [];
        
        // Ajouter les précommandes
        preordersResult.data?.forEach(item => {
            if (item.email) {
                contacts.push({
                    source: 'preorder',
                    email: item.email,
                    name: item.full_name || '',
                    date: item.created_at
                });
            }
        });
        
        // Ajouter les dons
        donorsResult.data?.forEach(item => {
            if (item.email) {
                contacts.push({
                    source: 'donor',
                    email: item.email,
                    name: item.full_name || '',
                    date: item.created_at
                });
            }
        });
        
        // Ajouter la waitlist
        waitlistResult.data?.forEach(item => {
            if (item.email) {
                contacts.push({
                    source: 'waitlist',
                    email: item.email,
                    name: item.full_name || '',
                    date: item.created_at
                });
            }
        });
        
        // Trier par date (plus récent en premier)
        contacts.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Générer le CSV
        const csvHeader = 'Source,Email,Nom,Date\n';
        const csvData = contacts.map(c => 
            `"${c.source}","${c.email}","${c.name.replace(/"/g, '""')}","${c.date}"`
        ).join('\n');
        
        const csv = csvHeader + csvData;
        
        // Headers pour le download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="oradia-contacts-${new Date().toISOString().split('T')[0]}.csv"`);
        
        res.send(csv);
        
    } catch (error) {
        console.error('❌ Erreur export contacts:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur lors de l\'export des contacts'
        });
    }
}
