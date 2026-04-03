const { verifyAdminAuth } = require('./_auth');

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        const decoded = verifyAdminAuth(req);

        const sessionAge = Math.floor((Date.now() - decoded.loginTime) / 1000 / 60);

        return res.status(200).json({
            success: true,
            admin: {
                email: decoded.email,
                type: decoded.type,
                sessionAge
            }
        });
        
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? 'Unauthorized' : 'Internal Server Error',
            message: error.message || 'Erreur serveur lors de la vérification'
        });
    }
}
