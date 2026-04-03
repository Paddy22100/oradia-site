const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

export default async function handler(req, res) {
    console.log('🔐 LOGIN ADMIN - DIAGNOSTIC');
    console.log('  - ADMIN_EMAIL:', process.env.ADMIN_EMAIL ? '✅ Présent' : '❌ Manquant');
    console.log('  - ADMIN_PASSWORD_HASH:', process.env.ADMIN_PASSWORD_HASH ? '✅ Présent' : '❌ Manquant');
    console.log('  - ADMIN_SESSION_SECRET:', process.env.ADMIN_SESSION_SECRET ? '✅ Présent' : '❌ Manquant');
    console.log('  - NODE_ENV:', process.env.NODE_ENV || 'development');

    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed',
            message: 'Méthode non autorisée'
        });
    }

    try {
        const { email, password } = req.body || {};

        console.log('📧 Email reçu:', email || '❌ Manquant');
        console.log('🔑 Mot de passe reçu:', password ? '✅ Présent' : '❌ Manquant');

        if (!email || !password) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Email et mot de passe requis'
            });
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        const sessionSecret = process.env.ADMIN_SESSION_SECRET;

        if (!adminEmail || !adminPasswordHash || !sessionSecret) {
            return res.status(500).json({
                error: 'Configuration Error',
                message: 'Erreur de configuration du serveur'
            });
        }

        if (email !== adminEmail) {
            console.log('❌ Email incorrect:', email, 'attendu:', adminEmail);
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }

        console.log('✅ Email admin vérifié');

        const isValidPassword = await bcrypt.compare(password, adminPasswordHash);
        console.log('🔐 Résultat bcrypt.compare:', isValidPassword ? '✅ Valide' : '❌ Invalide');

        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Identifiants incorrects'
            });
        }

        const token = jwt.sign(
            {
                email: adminEmail,
                role: 'admin',
                loginTime: Date.now()
            },
            sessionSecret,
            { expiresIn: '2h' }
        );

        const cookieValue = cookie.serialize('oradia_admin_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 2 * 60 * 60
        });

        res.setHeader('Set-Cookie', cookieValue);

        return res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            admin: {
                email: adminEmail,
                role: 'admin'
            }
        });
    } catch (error) {
        console.error('❌ Erreur login admin:', error.message);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Erreur serveur lors de la connexion'
        });
    }
}
