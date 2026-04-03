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
        // Récupérer toutes les données
        const [preordersResult, donorsResult, waitlistResult] = await Promise.all([
            // Précommandes payées
            supabase
                .from('preorders')
                .select('email, full_name, amount_total, paid_status, created_at, offer, city')
                .eq('paid_status', 'completed')
                .order('created_at', { ascending: false }),
            
            // Dons payés
            supabase
                .from('donors')
                .select('email, full_name, amount_total, paid_status, created_at')
                .eq('paid_status', 'completed')
                .order('created_at', { ascending: false }),
            
            // Waitlist
            supabase
                .from('waitlist_tirages')
                .select('email, full_name, created_at, brevo_synced')
                .order('created_at', { ascending: false })
        ]);

        const preorders = preordersResult.data || [];
        const donors = donorsResult.data || [];
        const waitlist = waitlistResult.data || [];

        // Préparer les données CSV
        const csvData = [];
        
        // En-têtes
        csvData.push([
            'Type',
            'Email',
            'Nom complet',
            'Montant (€)',
            'Statut paiement',
            'Offre',
            'Ville',
            'Date',
            'Sync Brevo'
        ]);

        // Ajouter les précommandes
        preorders.forEach(preorder => {
            csvData.push([
                'Précommande',
                preorder.email || '',
                preorder.full_name || '',
                preorder.amount_total || 0,
                preorder.paid_status || '',
                preorder.offer || '',
                preorder.city || '',
                formatDate(preorder.created_at),
                ''
            ]);
        });

        // Ajouter les dons
        donors.forEach(donor => {
            csvData.push([
                'Don',
                donor.email || '',
                donor.full_name || '',
                donor.amount_total || 0,
                donor.paid_status || '',
                '',
                '',
                formatDate(donor.created_at),
                ''
            ]);
        });

        // Ajouter la waitlist
        waitlist.forEach(item => {
            csvData.push([
                'Waitlist',
                item.email || '',
                item.full_name || '',
                '',
                '',
                '',
                '',
                formatDate(item.created_at),
                item.brevo_synced ? 'Oui' : 'Non'
            ]);
        });

        // Générer le CSV
        const csvContent = csvData.map(row => 
            row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        // Nom du fichier avec date
        const fileName = `oradia-contacts-${new Date().toISOString().split('T')[0]}.csv`;

        // Headers pour le téléchargement
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        res.status(200).send(csvContent);

    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? 'Unauthorized' : 'Internal Server Error',
            message: error.message || 'Erreur lors de l\'export des contacts'
        });
    }
}

// Formater la date
function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
