const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Cookie parser pour Vercel
const cookie = require('cookie');

export default async function handler(req, res) {
    // Logs de diagnostic
    console.log('🔐 LOGIN ADMIN - DIAGNOSTIC');
    console.log('  - ADMIN_EMAIL:', process.env.ADMIN_EMAIL ? '✅ Présent' : '❌ Manquant');
    console.log('  - ADMIN_PASSWORD_HASH:', process.env.ADMIN_PASSWORD_HASH ? '✅ Présent' : '❌ Manquant');
    console.log('  - ADMIN_SESSION_SECRET:', process.env.ADMIN_SESSION_SECRET ? '✅ Présent' : '❌ Manquant');
    console.log('  - NODE_ENV:', process.env.NODE_ENV || 'development');
    
    // Seulement les requêtes POST
    if (req.method !== 'POST') {
        console.log('❌ Méthode non autorisée:', req.method);
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        // Parsing simple et saine du body
        const { email, password } = req.body || {};
        
        console.log('📧 Email reçu:', email || '❌ Manquant');
        console.log('🔑 Mot de passe reçu:', password ? '✅ Présent' : '❌ Manquant');
        
        // Validation basique
        if (!email || !password) {
            console.log('❌ Email ou mot de passe manquant');
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
            console.error('❌ Variables d\'environnement manquantes');
            return res.status(500).json({
                error: 'Configuration Error',
                message: 'Erreur de configuration du serveur'
            });
        }
        
        // Vérifier si c'est l'email admin
        if (email !== adminEmail) {
            console.log('❌ Email incorrect:', email, 'attendu:', adminEmail);
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }
        
        console.log('✅ Email admin vérifié');
        
        // Vérifier le mot de passe avec bcrypt
        const isValidPassword = await bcrypt.compare(password, adminPasswordHash);
        console.log('🔐 Résultat bcrypt.compare:', isValidPassword ? '✅ Valide' : '❌ Invalide');
        
        if (!isValidPassword) {
            console.log('❌ Mot de passe incorrect');
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }
        
        console.log('✅ Mot de passe vérifié');
        
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
        
        console.log('✅ Cookie créé, connexion réussie');
        
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
        console.error('❌ Erreur login admin:', error.message);
        console.error('❌ Stack complet:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur serveur lors de la connexion'
        });
    }
}
