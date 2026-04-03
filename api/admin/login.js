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
        
        if (!adminEmail || !adminPasswordHash || !sessionSecret) {
            console.error('❌ Configuration admin manquante');
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'Configuration admin manquante'
            });
        }
        
        // Vérifier l'email
        if (email !== adminEmail) {
            console.log(`❌ Tentative connexion avec email invalide: ${email}`);
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }
        
        // Vérifier le mot de passe
        const isValidPassword = await bcrypt.compare(password, adminPasswordHash);
        
        if (!isValidPassword) {
            console.log(`❌ Tentative connexion avec mot de passe invalide pour: ${email}`);
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }
        
        // Créer le JWT token
        const payload = {
            email,
            loginTime: Date.now(),
            type: 'admin'
        };
        
        const token = jwt.sign(payload, sessionSecret, {
            expiresIn: '2h'
        });
        
        // Définir le cookie HttpOnly
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 2 * 60 * 60 * 1000, // 2 heures
            path: '/'
        };
        
        res.setHeader('Set-Cookie', cookie.serialize('oradia_admin_session', token, cookieOptions));
        
        console.log(`✅ Admin connecté: ${email}`);
        
        res.json({
            success: true,
            message: 'Connexion réussie',
            admin: {
                email,
                loginTime: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur connexion admin:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur lors de la connexion'
        });
    }
}
