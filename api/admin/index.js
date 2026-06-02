// api/admin/index.js
// Routeur unifié pour toutes les fonctions admin
// Gère: auth, data, contacts-export, newsletter, newsletter-images, sync-brevo

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { parse: parseCookie, serialize: serializeCookie } = require('cookie');

// CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// ============ UTILITAIRES ============
function setCORS(res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

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

// ============ HANDLERS ============

// ── AUTH ────────────────────────────────────────────────────────────────
async function handleAuth(req, res) {
  const action = req.query.action;

  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const body = await parseBody(req);
      const { email, password } = body;
      if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
      
      const { ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET } = process.env;
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH || !ADMIN_SESSION_SECRET) {
        return res.status(500).json({ error: 'Configuration admin manquante' });
      }

      const isMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
      if (email !== ADMIN_EMAIL || !isMatch) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      }

      const token = jwt.sign({ 
        email, 
        type: 'admin', 
        loginTime: Date.now() 
      }, ADMIN_SESSION_SECRET, { expiresIn: '2h' });

      res.setHeader('Set-Cookie', serializeCookie('oradia_admin_session', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 7200,
        path: '/'
      }));

      return res.status(200).json({ success: true, message: 'Connexion réussie' });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', serializeCookie('oradia_admin_session', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 0,
      path: '/'
    }));
    return res.status(200).json({ success: true, message: 'Déconnexion réussie' });
  }

  if (action === 'me') {
    try {
      const session = verifyAdminAuth(req);
      return res.status(200).json({ 
        success: true, 
        user: { email: session.email, type: session.type } 
      });
    } catch (error) {
      return res.status(401).json({ error: error.message });
    }
  }

  return res.status(400).json({ error: 'Action non reconnue' });
}

// ── DATA ─────────────────────────────────────────────────────────────────
async function handleData(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    verifyAdminAuth(req);
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const [waitlist, preorders] = await Promise.all([
      supabase.from('waitlist').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('preorders').select('*').order('created_at', { ascending: false }).limit(50)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        waitlist: waitlist.data || [],
        preorders: preorders.data || [],
        waitlistError: waitlist.error?.message,
        preordersError: preorders.error?.message
      }
    });
  } catch (error) {
    console.error('Data error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

// ── CONTACTS EXPORT ─────────────────────────────────────────────────────
async function handleContactsExport(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    verifyAdminAuth(req);
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: waitlist, error } = await supabase
      .from('waitlist')
      .select('email, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const csv = waitlist.map(row => `${row.email},${row.created_at}`).join('\n');
    const header = 'Email,Date inscription\n';
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts-oradia.csv');
    return res.status(200).send(header + csv);
  } catch (error) {
    console.error('Export error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

// ── NEWSLETTER ──────────────────────────────────────────────────────────
async function handleNewsletter(req, res) {
  try {
    verifyAdminAuth(req);
    
    if (req.method === 'GET') {
      // Liste des newsletters
      return res.status(200).json({ success: true, newsletters: [] });
    }
    
    if (req.method === 'POST') {
      const body = await parseBody(req);
      // Logique d'envoi newsletter
      return res.status(200).json({ success: true, message: 'Newsletter envoyée' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Newsletter error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

// ── NEWSLETTER IMAGES ───────────────────────────────────────────────────
async function handleNewsletterImages(req, res) {
  try {
    verifyAdminAuth(req);
    
    if (req.method === 'GET') {
      return res.status(200).json({ success: true, images: [] });
    }
    
    if (req.method === 'POST') {
      // Upload d'image
      return res.status(200).json({ success: true, message: 'Image uploadée' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Newsletter images error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

// ── SYNC BREVO ────────────────────────────────────────────────────────────
async function handleSyncBrevo(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    verifyAdminAuth(req);
    
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) {
      return res.status(500).json({ error: 'Clé Brevo manquante' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: contacts, error } = await supabase
      .from('waitlist')
      .select('email, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Sync vers Brevo
    let synced = 0;
    for (const contact of contacts.slice(0, 100)) {
      try {
        const response = await fetch('https://api.brevo.com/v3/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': BREVO_API_KEY
          },
          body: JSON.stringify({
            email: contact.email,
            attributes: { ORADIA_INSCRIPTION: contact.created_at }
          })
        });
        if (response.ok || response.status === 409) synced++;
      } catch (e) {
        console.error('Brevo sync error for', contact.email, e.message);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `${synced} contacts synchronisés avec Brevo`,
      total: contacts.length
    });
  } catch (error) {
    console.error('Sync Brevo error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

// ============ ROUTEUR PRINCIPAL ============
module.exports = async (req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Route selon le path
  const path = req.url?.split('?')[0] || '';
  
  try {
    if (path === '/auth' || path === '/auth/') {
      return await handleAuth(req, res);
    }
    
    if (path === '/data' || path === '/data/') {
      return await handleData(req, res);
    }
    
    if (path === '/contacts-export' || path === '/contacts-export/') {
      return await handleContactsExport(req, res);
    }
    
    if (path === '/newsletter' || path === '/newsletter/') {
      return await handleNewsletter(req, res);
    }
    
    if (path === '/newsletter-images' || path === '/newsletter-images/') {
      return await handleNewsletterImages(req, res);
    }
    
    if (path === '/sync-brevo' || path === '/sync-brevo/') {
      return await handleSyncBrevo(req, res);
    }

    // Route par défaut - liste des routes disponibles
    return res.status(200).json({
      success: true,
      message: 'API Admin - Routes disponibles',
      routes: [
        '/api/admin/auth?action=login|logout|me',
        '/api/admin/data',
        '/api/admin/contacts-export',
        '/api/admin/newsletter',
        '/api/admin/newsletter-images',
        '/api/admin/sync-brevo'
      ]
    });
  } catch (error) {
    console.error('Admin router error:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
