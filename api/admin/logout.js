const jwt = require('jsonwebtoken');

// Cookie parser pour Vercel
const cookie = require('cookie');

export default async function handler(req, res) {
    // Seulement les requêtes POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        // Récupérer le cookie
        const cookies = cookie.parse(req.headers.cookie || '');
        const token = cookies.oradia_admin_session;
        
        if (token) {
            try {
                // Décoder le token (optionnel, juste pour le log)
                const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
                console.log(`Logout admin: ${decoded.email}`);
            } catch (error) {
                // Token invalide, mais on continue quand même
                console.log('Logout avec token invalide');
            }
        }
        
        // Supprimer le cookie
        const cookieValue = cookie.serialize('oradia_admin_session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 0 // Expiration immédiate
        });
        
        // Réponse succès
        res.setHeader('Set-Cookie', cookieValue);
        res.status(200).json({
            success: true,
            message: 'Déconnexion réussie'
        });
        
    } catch (error) {
        console.error('Erreur logout admin:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur serveur lors de la déconnexion'
        });
    }
}
