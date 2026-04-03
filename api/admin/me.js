const jwt = require('jsonwebtoken');

// Cookie parser pour Vercel
const cookie = require('cookie');

export default async function handler(req, res) {
    // Seulement les requêtes GET
    if (req.method !== 'GET') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        // Récupérer le cookie
        const cookies = cookie.parse(req.headers.cookie || '');
        const token = cookies.oradia_admin_session;
        
        if (!token) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Session non trouvée'
            });
        }
        
        // Vérifier le token
        const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
        
        // Vérifier que c'est bien un token admin
        if (decoded.type !== 'admin') {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Type de session invalide'
            });
        }
        
        // Vérifier si le token n'est pas trop vieux (2 heures max)
        const sessionAge = Math.floor((Date.now() - decoded.loginTime) / 1000 / 60); // en minutes
        if (sessionAge > 120) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Session expirée'
            });
        }
        
        // Réponse succès
        res.status(200).json({
            success: true,
            admin: {
                email: decoded.email,
                type: decoded.type,
                sessionAge: sessionAge
            }
        });
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Token invalide'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Session expirée'
            });
        }
        
        console.error('Erreur vérification session admin:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur serveur lors de la vérification'
        });
    }
}
