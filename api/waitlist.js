const https = require('https');

// Configuration Brevo depuis les variables d'environnement
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_WAITLIST_LIST_ID = process.env.BREVO_WAITLIST_LIST_ID;

/**
 * Validation d'email simple
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Appel API Brevo pour ajouter un contact à la liste d'attente
 */
async function addToBrevoWaitlist(email) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            email: email,
            listIds: [parseInt(BREVO_WAITLIST_LIST_ID)],
            updateEnabled: true
        });

        const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/contacts',
            method: 'POST',
            headers: {
                'api-key': BREVO_API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        data: parsedData
                    });
                } catch (error) {
                    reject(new Error('Erreur de parsing de la réponse Brevo'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

/**
 * Handler principal pour la route /api/waitlist
 */
export default async function handler(req, res) {
    // Vérifier la méthode HTTP
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Méthode non autorisée'
        });
    }

    // Vérifier les variables d'environnement
    if (!BREVO_API_KEY || !BREVO_WAITLIST_LIST_ID) {
        console.error('Variables Brevo manquantes:', {
            hasApiKey: !!BREVO_API_KEY,
            hasListId: !!BREVO_WAITLIST_LIST_ID
        });
        return res.status(500).json({
            success: false,
            message: 'Configuration du serveur incomplète'
        });
    }

    try {
        // Parser le body
        const body = req.body;
        const { email } = body;

        // Validation de l'email
        if (!email || typeof email !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'L\'adresse email est requise'
            });
        }

        const trimmedEmail = email.trim();
        if (!validateEmail(trimmedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Veuillez entrer une adresse email valide'
            });
        }

        // Appel à l'API Brevo
        const result = await addToBrevoWaitlist(trimmedEmail);

        // Gestion des réponses Brevo
        if (result.statusCode === 201 || result.statusCode === 200) {
            // Succès - contact créé ou mis à jour
            return res.status(200).json({
                success: true,
                message: 'Inscription réussie.'
            });
        } else if (result.statusCode === 400) {
            // Bad request - probablement email invalide ou déjà existant avec conflit
            console.warn('Brevo 400:', result.data);
            return res.status(400).json({
                success: false,
                message: 'Cet email est déjà inscrit ou invalide.'
            });
        } else {
            // Autres erreurs
            console.error('Brevo error:', result.statusCode, result.data);
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de l\'inscription. Veuillez réessayer.'
            });
        }

    } catch (error) {
        console.error('Waitlist API error:', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur technique. Veuillez réessayer plus tard.'
        });
    }
}
