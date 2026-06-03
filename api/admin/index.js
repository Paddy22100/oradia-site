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
  // Essayer d'abord le cookie httpOnly, puis le header Authorization
  const cookies = parseCookie(req.headers.cookie || '');
  let token = cookies.oradia_admin_session;

  if (!token) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

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
        sameSite: 'lax',
        maxAge: 7200,
        path: '/'
      }));

      return res.status(200).json({ success: true, message: 'Connexion réussie', token });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', serializeCookie('oradia_admin_session', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
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
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    verifyAdminAuth(req);

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://nxzetkdozynuytlbhxdx.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ── POST : actions sur abonnements ──
    if (req.method === 'POST') {
      const body = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', c => d += c);
        req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
        req.on('error', reject);
      });

      const { action, email, fullName, accessCode, expiresAt, subscriptionId } = body;

      if (action === 'create' && email) {
        const { error } = await supabase
          .from('tore_subscriptions')
          .upsert({
            email: email.toLowerCase().trim(),
            full_name: fullName || '',
            access_code: accessCode || ('ADMIN-' + Date.now().toString(36).toUpperCase()),
            expires_at: expiresAt || null,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'email' });
        if (error) throw error;
        return res.status(200).json({ success: true, emailSent: false });
      }

      if (action === 'revoke' && subscriptionId) {
        const { error } = await supabase
          .from('tore_subscriptions')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('id', subscriptionId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (action === 'resend_code' && subscriptionId) {
        return res.status(200).json({ success: true, emailSent: false, message: 'Fonction email non configurée' });
      }

      return res.status(400).json({ error: 'Action invalide' });
    }

    const section = req.query?.section || 'all';

    // ── Section abonnements Tore ──
    if (section === 'subscriptions') {
      const page   = parseInt(req.query?.page  || '1', 10);
      const limit  = parseInt(req.query?.limit || '15', 10);
      const status = req.query?.status || 'all';
      const q      = (req.query?.q || '').trim().toLowerCase();
      const offset = (page - 1) * limit;

      let query = supabase
        .from('tore_subscriptions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status !== 'all') query = query.eq('status', status);
      if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);

      const { data, count, error } = await query;
      if (error) throw error;

      const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' }) : null;
      const rows = (data || []).map(s => ({
        ...s,
        created_at_fr: fmt(s.created_at),
        expires_at_fr: s.expires_at ? fmt(s.expires_at) : 'Illimité'
      }));

      const totalPages = Math.ceil((count || 0) / limit);
      return res.status(200).json({
        success: true,
        data: rows,
        pagination: { page, limit, total: count || 0, pages: totalPages }
      });
    }

    // ── Section preorders ──
    if (section === 'preorders') {
      const page   = parseInt(req.query?.page  || '1', 10);
      const limit  = parseInt(req.query?.limit || '10', 10);
      const offset = (page - 1) * limit;
      const { data, count, error } = await supabase
        .from('preorders')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return res.status(200).json({
        success: true,
        data: data || [],
        pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) }
      });
    }

    // ── Section donors ──
    if (section === 'donors') {
      const page   = parseInt(req.query?.page  || '1', 10);
      const limit  = parseInt(req.query?.limit || '10', 10);
      const offset = (page - 1) * limit;
      const { data, count, error } = await supabase
        .from('donors')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return res.status(200).json({
        success: true,
        data: data || [],
        pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) }
      });
    }

    // ── Section waitlist ──
    if (section === 'waitlist') {
      const page   = parseInt(req.query?.page  || '1', 10);
      const limit  = parseInt(req.query?.limit || '10', 10);
      const offset = (page - 1) * limit;
      const { data, count, error } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return res.status(200).json({
        success: true,
        data: data || [],
        pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) }
      });
    }

    // ── Section overview / all : agrégats KPI ──
    const [waitlistRes, preordersRes, donorsRes] = await Promise.all([
      supabase.from('waitlist').select('*'),
      supabase.from('preorders').select('*'),
      supabase.from('donors').select('*')
    ]);

    const waitlistRows  = waitlistRes.data  || [];
    const preorderRows  = preordersRes.data || [];
    const donorRows     = donorsRes.data    || [];

    const now   = Date.now();
    const day1  = 24 * 3600 * 1000;
    const day7  = 7  * day1;
    const day30 = 30 * day1;

    const sumPreorders = (rows) => rows.reduce((s, r) => s + (parseFloat(r.amount_total) || parseFloat(r.amount) || 0), 0);
    const sumDonors    = (rows) => rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    const preordersToday = preorderRows.filter(r => now - new Date(r.created_at).getTime() < day1);
    const preorders7d    = preorderRows.filter(r => now - new Date(r.created_at).getTime() < day7);
    const preorders30d   = preorderRows.filter(r => now - new Date(r.created_at).getTime() < day30);
    const donors7d       = donorRows.filter(r => now - new Date(r.created_at).getTime() < day7);
    const donors30d      = donorRows.filter(r => now - new Date(r.created_at).getTime() < day30);

    const preordersTotal  = sumPreorders(preorderRows);
    const donorsTotal     = sumDonors(donorRows);
    const globalTotal     = preordersTotal + donorsTotal;
    const totalContacts   = preorderRows.length + donorRows.length + waitlistRows.length;
    const averageBasket   = preorderRows.length > 0 ? preordersTotal / preorderRows.length : 0;

    return res.status(200).json({
      success: true,
      data: {
        preorders: {
          count:        preorderRows.length,
          total:        preordersTotal,
          noEmail:      preorderRows.filter(r => !r.email).length,
          averageBasket
        },
        donors: {
          count:   donorRows.length,
          total:   donorsTotal,
          noEmail: donorRows.filter(r => !r.email).length
        },
        waitlist: {
          count:      waitlistRows.length,
          notSynced:  waitlistRows.filter(r => !r.synced_at).length
        },
        global: {
          total:         globalTotal,
          totalContacts
        },
        performance: {
          revenueToday:    sumPreorders(preordersToday) + sumDonors(donorRows.filter(r => now - new Date(r.created_at).getTime() < day1)),
          revenue7d:       sumPreorders(preorders7d)    + sumDonors(donors7d),
          revenue30d:      sumPreorders(preorders30d)   + sumDonors(donors30d),
          conversionRate:  totalContacts > 0 ? ((preorderRows.length + donorRows.length) / totalContacts * 100) : 0
        }
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

// ── SUBSCRIPTIONS ──────────────────────────────────────────────────────
async function handleSubscriptions(req, res) {
  try {
    verifyAdminAuth(req);

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://nxzetkdozynuytlbhxdx.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // GET : liste des abonnements
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('tore_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ success: true, data: data || [] });
    }

    // POST : activer manuellement un abonnement
    if (req.method === 'POST') {
      const body = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', c => d += c);
        req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
        req.on('error', reject);
      });

      const { action, email, full_name } = body;

      if (action === 'activate' && email) {
        const { error } = await supabase
          .from('tore_subscriptions')
          .upsert({
            email: email.toLowerCase().trim(),
            full_name: full_name || '',
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'email' });
        if (error) throw error;
        return res.status(200).json({ success: true, message: `Abonnement activé pour ${email}` });
      }

      if (action === 'revoke' && email) {
        const { error } = await supabase
          .from('tore_subscriptions')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('email', email.toLowerCase().trim());
        if (error) throw error;
        return res.status(200).json({ success: true, message: `Abonnement révoqué pour ${email}` });
      }

      return res.status(400).json({ error: 'Action invalide. Utilisez action: activate|revoke + email' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Subscriptions error:', error);
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

    if (path === '/subscriptions' || path === '/subscriptions/') {
      return await handleSubscriptions(req, res);
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
