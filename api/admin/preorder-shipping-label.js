const { createClient } = require('@supabase/supabase-js');
const { verifyAdminAuth } = require('./_auth');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Récupère l'étiquette d'expédition d'une précommande
 * GET /api/admin/preorder-shipping-label?id=preorder_id
 */
export default async function handler(req, res) {
    // Vérifier la méthode
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        // Vérifier l'authentification admin
        const decoded = verifyAdminAuth(req);

        const { id } = req.query;

        // Validation
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'ID de précommande requis'
            });
        }

        // Charger la précommande
        const preorder = await loadPreorder(id);
        if (!preorder) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Précommande non trouvée'
            });
        }

        // Vérifier qu'une étiquette existe
        if (!preorder.label_base64 && !preorder.label_url) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Aucune étiquette disponible pour cette commande'
            });
        }

        // Si URL disponible, rediriger vers l'URL
        if (preorder.label_url) {
            return res.status(200).json({
                success: true,
                label_url: preorder.label_url,
                tracking_number: preorder.tracking_number
            });
        }

        // Si base64 disponible, retourner le PDF
        if (preorder.label_base64) {
            try {
                // Convertir base64 en buffer
                const pdfBuffer = Buffer.from(preorder.label_base64, 'base64');
                
                // Retourner le PDF directement
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="etiquette_${preorder.shipment_number || preorder.id}.pdf"`);
                res.setHeader('Content-Length', pdfBuffer.length);
                
                return res.send(pdfBuffer);
                
            } catch (error) {
                console.error('Erreur conversion base64 PDF:', error);
                
                // Fallback: retourner en JSON
                return res.status(200).json({
                    success: true,
                    label_base64: preorder.label_base64,
                    tracking_number: preorder.tracking_number,
                    message: 'Données base64 - conversion PDF requise côté client'
                });
            }
        }

        return res.status(404).json({
            success: false,
            error: 'Not Found',
            message: 'Format d\'étiquette non supporté'
        });

    } catch (error) {
        console.error('Erreur récupération étiquette:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Erreur lors de la récupération de l\'étiquette'
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
