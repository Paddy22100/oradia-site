const jwt = require('jsonwebtoken');
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
        // Supprimer le cookie
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 0, // Expire immédiatement
            path: '/'
        };
        
        res.setHeader('Set-Cookie', cookie.serialize('oradia_admin_session', '', cookieOptions));
        
        console.log('✅ Admin déconnecté');
        
        res.json({
            success: true,
            message: 'Déconnexion réussie'
        });
        
    } catch (error) {
        console.error('❌ Erreur déconnexion admin:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur lors de la déconnexion'
        });
    }
}
