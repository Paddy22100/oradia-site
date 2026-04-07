const { createClient } = require('@supabase/supabase-js');
const { verifyAdminAuth } = require('./_auth');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Marque une précommande comme expédiée
 * POST /api/admin/mark-shipped
 */
export default async function handler(req, res) {
    // Vérifier la méthode
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        // Vérifier l'authentification admin
        const decoded = verifyAdminAuth(req);

        const { preorderId } = req.body;

        // Validation
        if (!preorderId) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'ID de précommande requis'
            });
        }

        // Charger la précommande
        const preorder = await loadPreorder(preorderId);
        if (!preorder) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Précommande non trouvée'
            });
        }

        // Vérifier qu'une étiquette existe
        if (!preorder.label_base64 && !preorder.label_url) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Impossible de marquer comme expédié: aucune étiquette créée'
            });
        }

        // Vérifier le statut actuel
        if (preorder.shipping_status === 'shipped') {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'La commande est déjà marquée comme expédiée'
            });
        }

        // Mettre à jour le statut
        const updatedPreorder = await markAsShipped(preorderId);

        console.log(`Précommande ${preorderId} marquée comme expédiée`);

        return res.status(200).json({
            success: true,
            message: 'Commande marquée comme expédiée avec succès',
            shipped_at: updatedPreorder.shipped_at
        });

    } catch (error) {
        console.error('Erreur marquage expédié:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Erreur lors du marquage comme expédié'
        });
    }
}

/**
 * Charge une précommande depuis la base de données
 */
async function loadPreorder(preorderId) {
    try {
        const { data, error } = await supabase
            .from('preorders')
            .select('*')
            .eq('id', preorderId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erreur chargement précommande:', error);
        return null;
    }
}

/**
 * Marque une précommande comme expédiée
 */
async function markAsShipped(preorderId) {
    try {
        const updateData = {
            shipping_status: 'shipped',
            shipped_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('preorders')
            .update(updateData)
            .eq('id', preorderId)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erreur mise à jour statut expédié:', error);
        throw error;
    }
}
