const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function verifyAdminAuth(req) {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies.oradia_admin_session;

    if (!token) {
        const err = new Error('Session non trouvée');
        err.statusCode = 401;
        throw err;
    }

    const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);

    if (decoded.type !== 'admin') {
        const err = new Error('Type de session invalide');
        err.statusCode = 401;
        throw err;
    }

    const sessionAge = Math.floor((Date.now() - decoded.loginTime) / 1000 / 60);
    if (sessionAge > 120) {
        const err = new Error('Session expirée');
        err.statusCode = 401;
        throw err;
    }

    return decoded;
}

module.exports = { verifyAdminAuth };
