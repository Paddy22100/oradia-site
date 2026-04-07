const { createClient } = require('@supabase/supabase-js');
const { verifyAdminAuth } = require('../admin/_auth');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration Mondial Relay API 2
const MONDIAL_RELAY_API2_URL = process.env.MONDIAL_RELAY_API2_URL || 'https://api.mondialrelay.com/WebService/WebService.asmx';
const MONDIAL_RELAY_API2_LOGIN = process.env.MONDIAL_RELAY_API2_LOGIN;
const MONDIAL_RELAY_API2_PASSWORD = process.env.MONDIAL_RELAY_API2_PASSWORD;

/**
 * Crée une expédition Mondial Relay pour une précommande
 * POST /api/mondial-relay/create-shipment
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

        // Vérifier le statut de paiement
        if (preorder.paid_status !== 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'La précommande n\'est pas payée'
            });
        }

        // Vérifier qu'une expédition n'existe pas déjà
        if (preorder.shipping_status === 'label_created' || preorder.shipping_status === 'shipped') {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Une expédition existe déjà pour cette commande'
            });
        }

        // Vérifier la méthode de livraison
        if (preorder.shipping_method !== 'relay' && preorder.shipping_method !== 'home') {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Méthode de livraison non supportée pour Mondial Relay'
            });
        }

        // Vérifier le point relais pour livraison relay
        if (preorder.shipping_method === 'relay' && !preorder.relay_id) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Point relais manquant pour la livraison en point relais'
            });
        }

        // Créer l'expédition
        const shipmentResult = await createMondialRelayShipment(preorder);

        // Mettre à jour la précommande avec les informations d'expédition
        await updatePreorderShipment(preorder.id, shipmentResult);

        console.log(`Expédition créée pour la précommande ${preorder.id}: ${shipmentResult.tracking_number}`);

        return res.status(200).json({
            success: true,
            shipment: {
                shipment_number: shipmentResult.shipment_number,
                tracking_number: shipmentResult.tracking_number,
                label_url: shipmentResult.label_url,
                label_base64: shipmentResult.label_base64
            }
        });

    } catch (error) {
        console.error('Erreur création expédition Mondial Relay:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Erreur lors de la création de l\'expédition'
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
 * Crée une expédition via l'API Mondial Relay
 */
async function createMondialRelayShipment(preorder) {
    try {
        // TODO_MONDIAL_RELAY_MAPPING: Adapter selon la documentation exacte de l'API 2
        // Pour l'instant, simulation avec données de test
        
        const shipmentNumber = `MR${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        const trackingNumber = `1Z${Math.random().toString(36).substr(2, 16).toUpperCase()}`;
        
        // Simulation de création d'étiquette
        const labelBase64 = generateMockLabel(preorder);
        
        console.log(`Simulation création expédition ${shipmentNumber} pour ${preorder.shipping_method}`);
        
        return {
            shipment_number: shipmentNumber,
            tracking_number: trackingNumber,
            label_url: null, // Pas d'URL pour la simulation
            label_base64: labelBase64
        };

    } catch (error) {
        console.error('Erreur API Mondial Relay shipment:', error);
        throw new Error('Impossible de créer l\'expédition Mondial Relay');
    }
}

/**
 * Met à jour la précommande avec les informations d'expédition
 */
async function updatePreorderShipment(preorderId, shipmentResult) {
    try {
        const updateData = {
            shipping_provider: 'mondial_relay',
            shipping_status: 'label_created',
            shipment_number: shipmentResult.shipment_number,
            tracking_number: shipmentResult.tracking_number,
            label_url: shipmentResult.label_url,
            label_base64: shipmentResult.label_base64,
            shipped_at: null // Sera mis à jour lors du marquage comme expédié
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
        console.error('Erreur mise à jour précommande:', error);
        throw error;
    }
}

/**
 * Génère une étiquette de test (à supprimer quand API réelle implémentée)
 */
function generateMockLabel(preorder) {
    // Simulation d'étiquette PDF en base64
    const mockLabelData = `Étiquette Mondial Relay
Expédition: ${preorder.shipment_number}
Tracking: ${preorder.tracking_number}
Destinataire: ${preorder.full_name}
Adresse: ${preorder.shipping_address}
${preorder.postal_code} ${preorder.city}
Méthode: ${preorder.shipping_method}
${preorder.shipping_method === 'relay' ? `Point relais: ${preorder.relay_name}` : ''}`;

    // Convertir en base64 (simulation)
    return Buffer.from(mockLabelData).toString('base64');
}

/**
 * Appel réel à l'API Mondial Relay pour création d'expédition (à implémenter)
 */
async function callMondialRelayShipmentAPI(preorder) {
    // TODO_MONDIAL_RELAY_MAPPING: Implémenter selon la documentation exacte
    // Exemple de structure possible (à adapter):
    
    const payload = {
        Enseigne: MONDIAL_RELAY_API2_LOGIN,
        PrivateKey: MONDIAL_RELAY_API2_PASSWORD,
        Langage: 'FR',
        // Paramètres expéditeur
        Expediteur: {
            Nom: 'Oradia',
            Adresse1: 'Adresse expéditeur',
            Adresse2: '',
            CP: '75001',
            Ville: 'Paris',
            Pays: 'FR',
            Tel: '0123456789',
            Mail: 'contact@oradia.fr'
        },
        // Paramètres destinataire
        Destinataire: {
            Nom: preorder.full_name,
            Adresse1: preorder.shipping_address,
            Adresse2: preorder.address_complement || '',
            CP: preorder.postal_code,
            Ville: preorder.city,
            Pays: preorder.country,
            Tel: preorder.phone || '',
            Mail: preorder.email
        },
        // Paramètres colis
        Colis: {
            Poids: '0.5', // kg
            Longueur: '30',
            Largeur: '20',
            Hauteur: '10'
        }
    };

    // Ajouter point relais si livraison relay
    if (preorder.shipping_method === 'relay') {
        payload.Destinataire.Relais = {
            ID: preorder.relay_id,
            Pays: preorder.relay_country || 'FR'
        };
    }

    const response = await fetch(MONDIAL_RELAY_API2_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'SOAPAction': 'http://www.mondialrelay.fr/WebService/WebService.asmx/WSI2_CreationEtiquette'
        },
        body: new URLSearchParams(payload).toString()
    });

    if (!response.ok) {
        throw new Error(`API Mondial Relay error: ${response.status}`);
    }

    const xmlResponse = await response.text();
    
    // Parser la réponse XML et extrair les infos d'expédition
    return parseShipmentResponse(xmlResponse);
}

/**
 * Parser la réponse XML de création d'étiquette (à implémenter)
 */
function parseShipmentResponse(xmlResponse) {
    // TODO_MONDIAL_RELAY_MAPPING: Parser XML selon format exact
    // Retourner les informations d'expédition
    return {
        shipment_number: '',
        tracking_number: '',
        label_base64: ''
    };
}
