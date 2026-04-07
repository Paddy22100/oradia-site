const xml2js = require('xml2js');
const crypto = require('crypto');

const MONDIAL_RELAY_API1_URL =
  process.env.MONDIAL_RELAY_API1_URL || 'https://api.mondialrelay.com/Web_Services.asmx';
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
 * Calcule le hash Security selon la doc Mondial Relay WSI4_PointRelais_Recherche
 */
function calculateSecurity(payload, privateKey) {
    // Ordre exact des paramètres selon doc WSI4_PointRelais_Recherche
    const securityString = [
        payload.Enseigne,
        payload.Pays,
        payload.NumPointRelais || '',
        payload.Ville || '',
        payload.CP || '',
        payload.Latitude || '',
        payload.Longitude || '',
        payload.Taille || '',
        payload.Poids || '',
        payload.Action,
        payload.DelaiEnvoi || '',
        payload.RayonRecherche || '',
        payload.NombreResultats || '',
        payload.TypeActivite || '',
        payload.NACE || ''
    ].join('') + privateKey;
    
    // Hash MD5 en majuscules selon doc Mondial Relay
    const hash = crypto.createHash('md5').update(securityString, 'utf8').digest('hex').toUpperCase();
    
    console.log('Security string (partielle):', securityString.substring(0, 50) + '...');
    console.log('Security string (fin):', '...' + securityString.substring(securityString.length - 30));
    console.log('Security hash calculé (masqué):', hash.substring(0, 8) + '...' + hash.substring(hash.length - 4));
    
    return hash;
}

/**
 * Génère le body SOAP XML pour WSI4_PointRelais_Recherche
 */
function generateSOAPBody(payload) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI4_PointRelais_Recherche xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${payload.Enseigne}</Enseigne>
      <Pays>${payload.Pays}</Pays>
      <NumPointRelais>${payload.NumPointRelais || ''}</NumPointRelais>
      <Ville>${payload.Ville || ''}</Ville>
      <CP>${payload.CP || ''}</CP>
      <Latitude>${payload.Latitude || ''}</Latitude>
      <Longitude>${payload.Longitude || ''}</Longitude>
      <Taille>${payload.Taille || ''}</Taille>
      <Poids>${payload.Poids || ''}</Poids>
      <Action>${payload.Action}</Action>
      <DelaiEnvoi>${payload.DelaiEnvoi || ''}</DelaiEnvoi>
      <RayonRecherche>${payload.RayonRecherche || ''}</RayonRecherche>
      <NombreResultats>${payload.NombreResultats}</NombreResultats>
      <TypeActivite>${payload.TypeActivite || ''}</TypeActivite>
      <NACE>${payload.NACE || ''}</NACE>
      <Security>${payload.Security}</Security>
    </WSI4_PointRelais_Recherche>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Appel réel à l'API Mondial Relay
 */
async function callMondialRelayAPI(postalCode, country) {
    const payload = {
        Enseigne: MONDIAL_RELAY_ENSEIGNE,
        Pays: country,
        NumPointRelais: '',
        Ville: '',
        CP: postalCode,
        Latitude: '',
        Longitude: '',
        Taille: '', // Vide par défaut selon doc
        Poids: '',
        Action: '24R', // Point Relais L
        DelaiEnvoi: '0',
        RayonRecherche: '',
        NombreResultats: '20',
        TypeActivite: '',
        NACE: ''
    };

    // Calculer le Security hash
    const security = calculateSecurity(payload, MONDIAL_RELAY_PRIVATE_KEY);
    payload.Security = security;

    // Générer le body SOAP XML
    const soapBody = generateSOAPBody(payload);

    console.log('Payload final utilisé:', JSON.stringify(payload, null, 2));
    console.log('=== SOAP BODY ENVOYÉ ===');
    console.log(soapBody.substring(0, 1000));
    console.log('=== FIN SOAP BODY ===');

    const response = await fetch(MONDIAL_RELAY_API1_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'http://www.mondialrelay.fr/webservice/WSI4_PointRelais_Recherche',
            'MessageType': 'CALL'
        },
        body: soapBody
    });

    console.log('=== HEADERS REQUÊTE ENVOYÉS ===');
    console.log('Content-Type: text/xml; charset=utf-8');
    console.log('SOAPAction: http://www.mondialrelay.fr/webservice/WSI4_PointRelais_Recherche');
    console.log('MessageType: CALL');
    console.log('=== FIN HEADERS ===');

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
    const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true
    });

    const parsedData = await parser.parseStringPromise(xmlResponse);

    console.log('=== XML PREVIEW ===');
    console.log(xmlResponse.slice(0, 1500));
    console.log('=== PARSED JSON PREVIEW ===');
    console.log(JSON.stringify(parsedData, null, 2).slice(0, 3000));

    // Récupérer WSI4_PointRelais_RechercheResult avec les variants SOAP possibles
    const result = 
        parsedData?.['soap:Envelope']?.['soap:Body']?.WSI4_PointRelais_RechercheResponse?.WSI4_PointRelais_RechercheResult
        || parsedData?.['soap12:Envelope']?.['soap12:Body']?.WSI4_PointRelais_RechercheResponse?.WSI4_PointRelais_RechercheResult
        || parsedData?.soap?.Envelope?.Body?.WSI4_PointRelais_RechercheResponse?.WSI4_PointRelais_RechercheResult;

    if (!result) {
        throw new Error('No WSI4_PointRelais_RechercheResult node found');
    }

    const details = result?.PointsRelais?.PointRelais_Details;
    if (!details) {
        throw new Error('No PointRelais_Details node found');
    }

    console.log('Structure trouvée: PointsRelais.PointRelais_Details');

    // Gérer les variantes: objet unique ou tableau
    const pointsArray = Array.isArray(details) ? details : [details];

    // Vérifier les STAT dans chaque point relais (robuste avec trim)
    const invalidStat = pointsArray.find(
        p => String(p?.STAT || '').trim() && String(p.STAT).trim() !== '0'
    );
    if (invalidStat) {
        throw new Error(`Erreur métier Mondial Relay - STAT: ${invalidStat.STAT}`);
    }

    // Logger les STAT des points pour debug
    console.log('=== STAT DES POINTS RELAIS ===');
    pointsArray.forEach((point, index) => {
        if (point?.STAT) {
            console.log(`Point ${index + 1} STAT: "${String(point.STAT).trim()}"`);
        }
    });
    console.log('=== FIN STAT ===');

    const mappedPoints = pointsArray
        .filter(point => point && point.Num && point.LgAdr1)
        .map(point => ({
            id: point.Num || '',
            name: point.LgAdr1 || '',
            address1: point.LgAdr1 || '',
            address2: point.LgAdr2 || point.LgAdr3 || point.LgAdr4 || '',
            postalCode: point.CP || '',
            city: point.Ville || '',
            country: point.Pays || 'FR',
            latitude: point.Latitude ? parseFloat(point.Latitude) : null,
            longitude: point.Longitude ? parseFloat(point.Longitude) : null
        }));

    // Si aucun point valide n'est retourné, logger le premier point brut pour debug
    if (mappedPoints.length === 0 && pointsArray.length > 0) {
        console.log('=== PREMIER POINT BRUT POUR DEBUG ===');
        console.log('Premier PointRelais_Details brut:', JSON.stringify(pointsArray[0], null, 2));
        console.log('=== FIN PREMIER POINT BRUT ===');
    }

    return mappedPoints;
}
