const jwt = require('jsonwebtoken');

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
        const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
        const token = cookies.oradia_admin_session;
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Unauthorized',
                message: 'Session admin requise' 
            });
        }
        
        // Vérifier le JWT
        const sessionSecret = process.env.ADMIN_SESSION_SECRET;
        
        if (!sessionSecret) {
            console.error('❌ ADMIN_SESSION_SECRET non configuré');
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'Configuration manquante'
            });
        }
        
        const decoded = jwt.verify(token, sessionSecret);
        
        // Vérifier que c'est un token admin
        if (decoded.type !== 'admin') {
            return res.status(401).json({ 
                error: 'Unauthorized',
                message: 'Token invalide' 
            });
        }
        
        // Calculer l'âge de la session
        const sessionAge = Math.floor((Date.now() - decoded.loginTime) / 1000 / 60); // en minutes
        
        res.json({
            success: true,
            admin: {
                email: decoded.email,
                loginTime: new Date(decoded.loginTime).toISOString(),
                sessionAge: sessionAge
            }
        });
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Unauthorized',
                message: 'Session expirée ou invalide' 
            });
        }
        
        console.error('❌ Erreur vérification session:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur lors de la vérification de session'
        });
    }
}
