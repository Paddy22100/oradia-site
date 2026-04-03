const bcrypt = require('bcrypt');
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
        const { email, password } = req.body;
        
        // Validation basique
        if (!email || !password) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Email et mot de passe requis'
            });
        }
        
        // Récupérer les identifiants admin depuis les variables d'environnement
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        const sessionSecret = process.env.ADMIN_SESSION_SECRET;
        
        // Validation des variables d'environnement
        if (!adminEmail || !adminPasswordHash || !sessionSecret) {
            console.error('Variables d\'environnement manquantes pour l\'auth admin');
            return res.status(500).json({
                error: 'Configuration Error',
                message: 'Erreur de configuration du serveur'
            });
        }
        
        // Vérifier si c'est l'email admin
        if (email !== adminEmail) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }
        
        // Vérifier le mot de passe avec bcrypt
        const isValidPassword = await bcrypt.compare(password, adminPasswordHash);
        
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }
        
        // Créer le token JWT
        const token = jwt.sign(
            { 
                email: adminEmail,
                role: 'admin',
                loginTime: Date.now()
            },
            sessionSecret,
            { expiresIn: '2h' }
        );
        
        // Définir le cookie HttpOnly
        const cookieValue = cookie.serialize('oradia_admin_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 2 * 60 * 60 * 1000 // 2 heures
        });
        
        // Réponse succès
        res.setHeader('Set-Cookie', cookieValue);
        res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            admin: {
                email: adminEmail,
                role: 'admin'
            }
        });
        
    } catch (error) {
        console.error('Erreur login admin:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur serveur lors de la connexion'
        });
    }
}
