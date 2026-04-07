const xml2js = require('xml2js');

const MONDIAL_RELAY_API1_URL =
  process.env.MONDIAL_RELAY_API1_URL || 'https://api.mondialrelay.com/WebService/WebService.asmx';
const MONDIAL_RELAY_ENSEIGNE = process.env.MONDIAL_RELAY_ENSEIGNE;
const MONDIAL_RELAY_PRIVATE_KEY = process.env.MONDIAL_RELAY_PRIVATE_KEY;

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    if (!MONDIAL_RELAY_ENSEIGNE || !MONDIAL_RELAY_PRIVATE_KEY) {
        console.error('Configuration Mondial Relay manquante:', {
            ENSEIGNE: !!MONDIAL_RELAY_ENSEIGNE,
            PRIVATE_KEY: !!MONDIAL_RELAY_PRIVATE_KEY
        });
        return res.status(500).json({
            success: false,
            error: 'Configuration Error',
            message: 'Service Mondial Relay non configuré correctement'
        });
    }

    try {
        const { postalCode, country = 'FR' } = req.query;

        if (!postalCode || postalCode.length < 5) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Code postal invalide'
            });
        }

        const points = await searchPickupPoints(postalCode, country);

        return res.status(200).json({
            success: true,
            points
        });
    } catch (error) {
        console.error('Erreur recherche points relais:', error);

        // Retourner temporairement l'erreur détaillée en mode debug
        return res.status(500).json({
            success: false,
            error: 'Mondial Relay debug',
            message: error.message,
            stack: error.stack?.slice(0, 500)
        });
    }
}

module.exports = handler;

/**
 * Recherche les points relais via API Mondial Relay
 */
async function searchPickupPoints(postalCode, country) {
    try {
        const points = await callMondialRelayAPI(postalCode, country);
        console.log(`Recherche points relais pour ${postalCode}, ${country}: ${points.length} trouvés`);
        return points;
    } catch (error) {
        console.error('Erreur API Mondial Relay DÉTAILLÉE:', error);
        console.error('Stack trace:', error.stack);
        throw error;
    }
}

/**
 * Appel réel à l'API Mondial Relay
 */
async function callMondialRelayAPI(postalCode, country) {
    const payload = {
        Enseigne: MONDIAL_RELAY_ENSEIGNE,
        Pays: country,
        CP: postalCode,
        Taille: '30', // Taille de la zone de recherche
        Action: 'PS', // Recherche de points relais
        DelaiEnvoi: '0',
        TypeActivite: '0',
        Ville: '',
        RS: '1',
        NuméroVersion: '3.0'
    };

    // Ajouter la clé privée si requise
    if (MONDIAL_RELAY_PRIVATE_KEY) {
        payload.PrivateKey = MONDIAL_RELAY_PRIVATE_KEY;
    }

    const response = await fetch(MONDIAL_RELAY_API1_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'SOAPAction': 'http://www.mondialrelay.fr/WebService/WebService.asmx/WSI2_RecherchePointRelais'
        },
        body: new URLSearchParams(payload).toString()
    });

    console.log(`API Mondial Relay - Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
        throw new Error(`API Mondial Relay HTTP error: ${response.status} ${response.statusText}`);
    }

    const xmlResponse = await response.text();
    console.log('=== DEBUG MONDIAL RELAY ===');
    console.log('STATUS HTTP:', response.status, response.statusText);
    console.log('RÉPONSE XML (1000 premiers caractères):', xmlResponse.substring(0, 1000));
    console.log('=== FIN DEBUG ===');
    
    // Parser la réponse XML et convertir en JSON
    return parseMondialRelayResponse(xmlResponse);
}

/**
 * Parser la réponse XML de Mondial Relay
 */
async function parseMondialRelayResponse(xmlResponse) {
    try {
        const parser = new xml2js.Parser({ 
            explicitArray: false,
            ignoreAttrs: false,
            mergeAttrs: true 
        });
        
        // Logger les 1500 premiers caractères du XML
        console.log('=== XML PREVIEW (1500 chars) ===');
        console.log(xmlResponse.substring(0, 1500));
        console.log('=== END XML PREVIEW ===');
        
        // Utiliser parseStringPromise pour éviter le callback hell
        const parsedData = await parser.parseStringPromise(xmlResponse);
        
        // Logger les 3000 premiers caractères du JSON parsé
        console.log('=== PARSED JSON PREVIEW (3000 chars) ===');
        console.log(JSON.stringify(parsedData, null, 2).substring(0, 3000));
        console.log('=== END PARSED JSON PREVIEW ===');
        
        // Extraire les points relais depuis la réponse SOAP
        const points = [];
        
        // La structure peut varier, essayer plusieurs chemins possibles
        let relayPoints = null;
        
        if (parsedData?.soap?.Envelope?.Body?.WSI2_RecherchePointRelaisResponse?.WSI2_RecherchePointRelaisResult?.PointsRelais) {
            relayPoints = parsedData.soap.Envelope.Body.WSI2_RecherchePointRelaisResponse.WSI2_RecherchePointRelaisResult.PointsRelais;
            console.log('Chemin trouvé: soap.Envelope.Body.WSI2_RecherchePointRelaisResponse.WSI2_RecherchePointRelaisResult.PointsRelais');
        } else if (parsedData?.['soap:Envelope']?.['soap:Body']?.WSI2_RecherchePointRelaisResponse?.WSI2_RecherchePointRelaisResult?.PointsRelais) {
            relayPoints = parsedData['soap:Envelope']['soap:Body'].WSI2_RecherchePointRelaisResponse.WSI2_RecherchePointRelaisResult.PointsRelais;
            console.log('Chemin trouvé: soap:Envelope.soap:Body.WSI2_RecherchePointRelaisResponse.WSI2_RecherchePointRelaisResult.PointsRelais');
        } else {
            // Lancer une erreur détaillée avec preview XML
            throw new Error(
                'Structure XML Mondial Relay inattendue. XML preview: ' + xmlResponse.slice(0, 1000)
            );
        }
        
        // Si c'est un tableau de points
        const pointsArray = Array.isArray(relayPoints) ? relayPoints : [relayPoints];
        
        for (const point of pointsArray) {
            if (point && point.Num && point.LgAdr1) {
                const relayPoint = {
                    id: point.Num || '',
                    name: point.LgAdr1 || '',
                    address1: point.LgAdr1 || '',
                    address2: point.LgAdr2 || point.LgAdr3 || '',
                    postalCode: point.CP || '',
                    city: point.Ville || '',
                    country: point.Pays || 'FR',
                    latitude: point.Latitude ? parseFloat(point.Latitude) : null,
                    longitude: point.Longitude ? parseFloat(point.Longitude) : null
                };
                
                points.push(relayPoint);
            }
        }
        
        console.log(`Parsing XML réussi: ${points.length} points relais extraits`);
        return points;
        
    } catch (error) {
        // Garder l'erreur détaillée, pas de message générique
        throw error;
    }
}
