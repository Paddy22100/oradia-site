// api/admin/auth.js
// Route unifiée : login + logout + me  (?action=login|logout|me)

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';

function verifyAdminAuth(req) {
    const cookies = parseCookie(req.headers.cookie || '');
    const token = cookies.oradia_admin_session;
    if (!token) { const e = new Error('Session non trouvée'); e.statusCode = 401; throw e; }
    const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
    if (decoded.type !== 'admin') { const e = new Error('Type de session invalide'); e.statusCode = 401; throw e; }
    const sessionAge = Math.floor((Date.now() - decoded.loginTime) / 1000 / 60);
    if (sessionAge > 120) { const e = new Error('Session expirée'); e.statusCode = 401; throw e; }
    return decoded;
}

export default async function handler(req, res) {
    const action = req.query.action;

    // ── LOGIN ────────────────────────────────────────────────────────────────
    if (action === 'login') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            console.log('🔐 LOGIN ATTEMPT');
            const { email, password } = req.body || {};
            if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
            const { ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET } = process.env;
            console.log('ENV CHECK:', {
                hasEmail: !!ADMIN_EMAIL,
                hasHash: !!ADMIN_PASSWORD_HASH,
                hasSecret: !!ADMIN_SESSION_SECRET,
                nodeEnv: process.env.NODE_ENV
            });
            if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH || !ADMIN_SESSION_SECRET)
                return res.status(500).json({ error: 'Erreur de configuration du serveur' });
            if (email !== ADMIN_EMAIL) return res.status(401).json({ error: 'Identifiants incorrects' });
            const valid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
            if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });
            const token = jwt.sign({ email: ADMIN_EMAIL, type: 'admin', loginTime: Date.now() },
                ADMIN_SESSION_SECRET, { expiresIn: '2h' });
            const isProduction = process.env.NODE_ENV === 'production';
            const cookieOptions = {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax',
                path: '/',
                maxAge: 2 * 60 * 60
            };
            
            // En production, ajouter le domain
            if (isProduction && req.headers.host) {
                const domain = req.headers.host.replace(/:\d+$/, '');
                if (!domain.includes('localhost')) {
                    cookieOptions.domain = domain.startsWith('.') ? domain : '.' + domain;
                }
            }
            
            const cookieValue = serializeCookie('oradia_admin_session', token, cookieOptions);
            console.log('✅ LOGIN SUCCESS - Cookie options:', cookieOptions);
            console.log('Cookie value:', cookieValue.substring(0, 100) + '...');
            res.setHeader('Set-Cookie', cookieValue);
            return res.status(200).json({ success: true, message: 'Connexion réussie',
                admin: { email: ADMIN_EMAIL, role: 'admin' } });
        } catch (e) {
            return res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
        }
    }

    // ── LOGOUT ───────────────────────────────────────────────────────────────
    if (action === 'logout') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        res.setHeader('Set-Cookie', serializeCookie('oradia_admin_session', '', {
            httpOnly: true, secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax', path: '/', maxAge: 0
        }));
        return res.status(200).json({ success: true, message: 'Déconnexion réussie' });
    }

    // ── ME ───────────────────────────────────────────────────────────────────
    if (action === 'me') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        try {
            console.log('🔍 ME CHECK - Cookies:', req.headers.cookie?.substring(0, 100) || 'AUCUN');
            const decoded = verifyAdminAuth(req);
            const sessionAge = Math.floor((Date.now() - decoded.loginTime) / 1000 / 60);
            console.log('✅ ME SUCCESS - Email:', decoded.email, 'Age:', sessionAge, 'min');
            return res.status(200).json({ success: true,
                admin: { email: decoded.email, type: decoded.type, sessionAge } });
        } catch (e) {
            console.log('❌ ME FAILED:', e.message);
            return res.status(e.statusCode || 500).json({ error: e.message });
        }
    }

    return res.status(400).json({ error: 'action manquante. Valeurs : login, logout, me' });
}
