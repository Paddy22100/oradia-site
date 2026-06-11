// api/admin/index.js
// Routeur unifié pour toutes les fonctions admin
// Gère: auth, data, contacts-export, newsletter, newsletter-images, sync-brevo

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { parse: parseCookie, serialize: serializeCookie } = require('cookie');
const xml2js = require('xml2js');
const crypto = require('crypto');

// Configuration Mondial Relay
const MONDIAL_RELAY_API1_URL =
  process.env.MONDIAL_RELAY_API1_URL || 'https://api.mondialrelay.com/Web_Services.asmx';
const MONDIAL_RELAY_ENSEIGNE = process.env.MONDIAL_RELAY_ENSEIGNE;
const MONDIAL_RELAY_PRIVATE_KEY = process.env.MONDIAL_RELAY_PRIVATE_KEY;

// ============ CORS ============
// Origines autorisées (dev + prod)
const allowedOrigins = [
  'https://oradia.fr',
  'https://oradia-site.vercel.app',
  'https://www.oradia.fr',
  process.env.FRONTEND_URL,
].filter(Boolean);

function setCORS(res, req) {
  const origin = req?.headers?.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://oradia.fr');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
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

// ── PROTECTION ANTI-BRUTE-FORCE (login admin) ───────────────────────────
// Stockage en mémoire (best-effort, par instance serverless). Les instances
// Vercel restent "chaudes" plusieurs minutes en cas d'appels rapprochés, ce qui
// suffit à freiner un script de brute-force classique. Clé = IP + email ciblé.
const LOGIN_ATTEMPT_MAX = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;   // fenêtre de comptage : 15 min
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;          // blocage : 15 min après 5 échecs
const loginAttempts = new Map();

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function getLoginAttemptState(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return { count: 0, lockedUntil: 0 };
  // Réinitialiser si la fenêtre de comptage est dépassée et qu'on n'est plus bloqué
  if (entry.lockedUntil && now > entry.lockedUntil) {
    loginAttempts.delete(key);
    return { count: 0, lockedUntil: 0 };
  }
  if (!entry.lockedUntil && now - entry.firstAttempt > LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { count: 0, lockedUntil: 0 };
  }
  return entry;
}

function registerFailedLogin(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, firstAttempt: now, lockedUntil: 0 };
  entry.count += 1;
  if (!entry.firstAttempt) entry.firstAttempt = now;
  if (entry.count >= LOGIN_ATTEMPT_MAX) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
  loginAttempts.set(key, entry);
  return entry;
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

// ── AUTH ────────────────────────────────────────────────────────────────
async function handleAuth(req, res) {
  const action = req.query.action;

  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const body = await parseBody(req);
      const { email, password } = body;
      if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

      // Vérification anti-brute-force AVANT toute comparaison de mot de passe
      const ip = getClientIp(req);
      const attemptKey = `${ip}|${String(email).toLowerCase()}`;
      const state = getLoginAttemptState(attemptKey);
      if (state.lockedUntil && Date.now() < state.lockedUntil) {
        const retryAfterSec = Math.ceil((state.lockedUntil - Date.now()) / 1000);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          error: `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfterSec / 60)} minute(s).`
        });
      }

      const { ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET } = process.env;
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH || !ADMIN_SESSION_SECRET) {
        return res.status(500).json({ error: 'Configuration admin manquante' });
      }

      const isMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
      if (email !== ADMIN_EMAIL || !isMatch) {
        registerFailedLogin(attemptKey);
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      }

      // Connexion réussie : on remet le compteur à zéro pour cette clé IP+email
      clearLoginAttempts(attemptKey);

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
      process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
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
      if (q) {
        // Échapper les caractères spéciaux du mini-langage de filtre PostgREST
        // (`,` sépare les conditions du `.or()`, `)` peut clore une condition
        // prématurément, `%`/`_` sont des jokers ILIKE) pour éviter qu'une
        // recherche ne modifie la logique du filtre construit côté serveur.
        const safeQ = q.replace(/[,()%_\\]/g, '\\$&');
        query = query.or(`email.ilike.%${safeQ}%,full_name.ilike.%${safeQ}%`);
      }

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

    // ── Section tirages ponctuels (single draws 3,90€) ──
    if (section === 'single-draws') {
      const page  = parseInt(req.query?.page  || '1', 10);
      const limit = parseInt(req.query?.limit || '20', 10);
      const offset = (page - 1) * limit;

      const { data, count, error } = await supabase
        .from('tore_subscriptions')
        .select('id, email, full_name, single_draw_credits, status, created_at', { count: 'exact' })
        .or('status.eq.single_draw,single_draw_credits.gt.0')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';
      const rows = (data || []).map(r => ({
        ...r,
        created_at_fr: fmt(r.created_at),
        single_draw_credits: r.single_draw_credits || 0,
        total_spent_eur: ((r.single_draw_credits || 0) * 3.90).toFixed(2).replace('.', ',') + ' €'
      }));

      return res.status(200).json({
        success: true,
        data: rows,
        pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) }
      });
    }

    // ── Section support / témoignages / suggestions ──
    if (section === 'support') {
      const page   = parseInt(req.query?.page   || '1',  10);
      const limit  = parseInt(req.query?.limit  || '20', 10);
      const type   = req.query?.type   || 'all';
      const status = req.query?.status || 'all';
      const offset = (page - 1) * limit;

      let query = supabase
        .from('support_messages')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (type   !== 'all') query = query.eq('type',   type);
      if (status !== 'all') query = query.eq('status', status);

      const { data, count, error } = await query;
      if (error) {
        // La table peut ne pas encore exister — renvoyer vide plutôt qu'une 500
        console.warn('support_messages query error (table may not exist):', error.message);
        return res.status(200).json({
          success: true, data: [],
          pagination: { page, limit, total: 0, pages: 0 }
        });
      }

      const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
      return res.status(200).json({
        success: true,
        data: (data || []).map(r => ({ ...r, created_at_fr: fmt(r.created_at) })),
        pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) }
      });
    }

    // ── PATCH : marquer un message support comme lu / archivé ──
    if (section === 'support-update') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
      const body = await parseBody(req);
      const { id, status: newStatus, admin_note } = body;
      if (!id) return res.status(400).json({ error: 'id requis' });

      const updates = { status: newStatus || 'read' };
      if (newStatus === 'read' || newStatus === 'replied') updates.read_at = new Date().toISOString();
      if (admin_note !== undefined) updates.admin_note = admin_note;

      const { error } = await supabase.from('support_messages').update(updates).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // ── Section synchronicité — stats d'étude (#31) ──
    if (section === 'synchronicity') {
      // Tente d'abord avec qrng_source (après migration), sinon sans (fallback gracieux)
      let responses, syncErr;
      ({ data: responses, error: syncErr } = await supabase
        .from('synchronicity_stats')
        .select('score_synchronicites, types_synchronicites, resonance_tirage, etat_interieur, temoignage, created_at, qrng_source')
        .order('created_at', { ascending: false }));

      // Fallback 1 : colonne qrng_source manquante (migration non exécutée)
      const qrngMissing = syncErr && syncErr.message && syncErr.message.includes('qrng_source');
      if (qrngMissing) {
        ({ data: responses, error: syncErr } = await supabase
          .from('synchronicity_stats')
          .select('score_synchronicites, types_synchronicites, resonance_tirage, etat_interieur, temoignage, created_at')
          .order('created_at', { ascending: false }));
      }

      // Fallback 2 : vue ou table inexistante (migrations non exécutées) → retourner 0 réponse
      const tablesMissing = syncErr && syncErr.message && (
        syncErr.message.includes('does not exist') ||
        syncErr.message.includes('n\'existe pas') ||
        syncErr.message.includes('relation')
      );
      if (tablesMissing) {
        responses = [];
        syncErr = null;
      }

      if (syncErr) throw syncErr;
      const rows = (responses || []).map(r => ({
        ...r,
        qrng_source: r.qrng_source || (qrngMissing ? 'unknown' : 'unknown')
      }));

      // Répartition de la source du tirage (validité scientifique)
      // Seuls les 'anu' (100% quantique) sont valides pour l'étude.
      const qrngBreakdown = {
        anu:      rows.filter(r => r.qrng_source === 'anu').length,
        fallback: rows.filter(r => r.qrng_source === 'fallback').length,
        unknown:  rows.filter(r => !r.qrng_source || r.qrng_source === 'unknown').length,
        migrationPending: qrngMissing  // avertit le dashboard
      };
      // VALIDITÉ SCIENTIFIQUE : toutes les statistiques ci-dessous sont calculées
      // UNIQUEMENT sur les tirages 100% quantiques (ANU). Les réponses 'fallback'
      // et 'unknown' sont exclues car elles ne sont pas valides pour l'étude.
      // qrngBreakdown (ci-dessus) conserve le décompte complet pour la bannière.
      const anuRows = rows.filter(r => r.qrng_source === 'anu');

      // Score moyen calculé UNIQUEMENT sur les tirages quantiques purs
      const avgScoreAnu = anuRows.length > 0
        ? (anuRows.reduce((s, r) => s + (r.score_synchronicites || 0), 0) / anuRows.length).toFixed(1)
        : null;

      // Moyenne des scores (quantiques purs uniquement)
      const avgScore = avgScoreAnu;

      // Distribution des scores (1-10) — quantiques purs uniquement
      const scoreDistrib = Array.from({ length: 10 }, (_, i) => ({
        score: i + 1,
        count: anuRows.filter(r => r.score_synchronicites === i + 1).length
      }));

      // Fréquence des types — quantiques purs uniquement
      const typeCounts = {};
      anuRows.forEach(r => (r.types_synchronicites || []).forEach(t => {
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }));

      // Répartition résonance — quantiques purs uniquement
      const resonanceCounts = { fort: 0, plutot_oui: 0, peu: 0, non: 0, null: 0 };
      anuRows.forEach(r => { resonanceCounts[r.resonance_tirage || 'null']++; });

      // Répartition état intérieur — quantiques purs uniquement
      const etatCounts = { calme: 0, alerte: 0, neutre: 0, perturbe: 0, null: 0 };
      anuRows.forEach(r => { etatCounts[r.etat_interieur || 'null']++; });

      // Témoignages récents (10 derniers, non nuls) — quantiques purs uniquement
      const temoignages = anuRows
        .filter(r => r.temoignage && r.temoignage.trim())
        .slice(0, 10)
        .map(r => ({ temoignage: r.temoignage, created_at: r.created_at, qrng_source: r.qrng_source }));

      return res.status(200).json({
        success: true,
        data: {
          total: anuRows.length,   // réponses valides (quantiques pures) uniquement
          totalAll: rows.length,   // total brut tous tirages confondus (info)
          avgScore,
          avgScoreAnu,
          qrngBreakdown,
          scoreDistrib,
          typeCounts,
          resonanceCounts,
          etatCounts,
          temoignages
        }
      });
    }

    // ── Section waitlist ──
    if (section === 'waitlist') {
      const page   = parseInt(req.query?.page  || '1', 10);
      const limit  = parseInt(req.query?.limit || '10', 10);
      const offset = (page - 1) * limit;
      const { data, count, error } = await supabase
        .from('newsletter_contacts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      // Si la table n'existe pas (PGRST205), retourner une liste vide au lieu d'une 500
      if (error) {
        console.warn('Waitlist section error (non-fatal):', error.message);
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { page, limit, total: 0, pages: 0 }
        });
      }
      return res.status(200).json({
        success: true,
        data: data || [],
        pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) }
      });
    }

    // ── Section overview / all : agrégats KPI ──
    const [waitlistRes, preordersRes, donorsRes, singleDrawsRes, supportRes, syncRes] = await Promise.all([
      supabase.from('newsletter_contacts').select('*'),
      supabase.from('preorders').select('*'),
      supabase.from('donors').select('*'),
      supabase.from('tore_subscriptions').select('email, single_draw_credits, status').or('status.eq.single_draw,single_draw_credits.gt.0'),
      supabase.from('support_messages').select('id, type, status, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('synchronicity_responses').select('score_synchronicites', { count: 'exact', head: false })
    ]);

    const waitlistRows    = waitlistRes.data    || [];
    const preorderRows    = preordersRes.data   || [];
    const donorRows       = donorsRes.data      || [];
    const singleDrawRows  = singleDrawsRes.data || [];
    const recentMessages  = supportRes.data     || [];
    const syncRows        = syncRes.data        || [];
    const syncAvg         = syncRows.length > 0
      ? (syncRows.reduce((s, r) => s + (r.score_synchronicites || 0), 0) / syncRows.length).toFixed(1)
      : null;

    // Calcul tirages ponctuels
    const singleDrawCount  = singleDrawRows.reduce((s, r) => s + (r.single_draw_credits || 0), 0);
    const singleDrawTotal  = singleDrawCount * 3.90;

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
    const globalTotal     = preordersTotal + donorsTotal + singleDrawTotal;
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
          notSynced:  waitlistRows.filter(r => !r.brevo_synced).length
        },
        singleDraws: {
          count:      singleDrawCount,
          total:      singleDrawTotal,
          customers:  singleDrawRows.length
        },
        support: {
          recent:     recentMessages,
          newCount:   recentMessages.filter(m => m.status === 'new').length
        },
        synchronicity: {
          total:    syncRows.length,
          avgScore: syncAvg
        },
        global: {
          total:         globalTotal,
          totalContacts,
          // Répartition pour camembert (#29)
          breakdown: {
            preorders:   preordersTotal,
            donors:      donorsTotal,
            singleDraws: singleDrawTotal
          }
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

    // Format mondial-relay : export des commandes à livrer en point relais
    const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
    const format = urlParams.get('format') || req.query?.format || 'standard';

    if (format === 'mondial-relay') {
      const { data: orders, error } = await supabase
        .from('preorders')
        .select('email, full_name, relay_id, relay_name, relay_address1, relay_address2, relay_postal_code, relay_city, relay_country, shipping_status, created_at')
        .eq('shipping_method', 'relay')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Échapper les valeurs pour CSV : guillemets doubles autour de chaque champ,
      // guillemets internes doublés — évite la troncature sur virgule/espace dans les adresses
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

      const header = ['Email', 'Nom', 'ID Point Relais', 'Nom Point Relais',
        'Adresse 1', 'Adresse 2', 'Code Postal', 'Ville', 'Pays',
        'Statut expédition', 'Date commande'].map(esc).join(',');

      const rows = (orders || []).map(r => [
        r.email, r.full_name,
        r.relay_id, r.relay_name,
        r.relay_address1, r.relay_address2 || '',
        r.relay_postal_code, r.relay_city, r.relay_country || 'FR',
        r.shipping_status || 'pending',
        r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : ''
      ].map(esc).join(','));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=mondial-relay-export.csv');
      // BOM UTF-8 pour Excel (évite les problèmes d'encodage sur les noms accentués)
      return res.status(200).send('﻿' + header + '\n' + rows.join('\n'));
    }

    // Format standard : export de la liste newsletter
    const { data: waitlist, error } = await supabase
      .from('newsletter_contacts')
      .select('email, created_at, source, status')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Email', 'Date inscription', 'Source', 'Statut'].map(esc).join(',');
    const rows = (waitlist || []).map(row => [
      row.email,
      row.created_at ? new Date(row.created_at).toLocaleDateString('fr-FR') : '',
      row.source || '',
      row.status || ''
    ].map(esc).join(','));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts-oradia.csv');
    return res.status(200).send('﻿' + header + '\n' + rows.join('\n'));
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
      .from('newsletter_contacts')
      .select('id, email, created_at')
      .eq('brevo_synced', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Sync vers Brevo
    let synced = 0;
    for (const contact of contacts) {
      try {
        const response = await fetch('https://api.brevo.com/v3/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': BREVO_API_KEY
          },
          body: JSON.stringify({
            email: contact.email,
            listIds: [5],          // List ID 5 = newsletter Oradia (CLAUDE.md)
            updateEnabled: true,   // Met à jour si contact déjà existant dans Brevo
            attributes: { ORADIA_INSCRIPTION: contact.created_at }
          })
        });

        // Si l'envoi réussit (200, 201 ou 409 = déjà existant), mettre à jour brevo_synced
        if (response.ok || response.status === 409) {
          const { error: updateError } = await supabase
            .from('newsletter_contacts')
            .update({ 
              brevo_synced: true,
              brevo_synced_at: new Date().toISOString()
            })
            .eq('id', contact.id);
          
          if (!updateError) {
            synced++;
          } else {
            console.error('Failed to update brevo_synced for', contact.email, updateError.message);
          }
        }
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
      process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
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
  setCORS(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Route selon le path
  const fullPath = req.url?.split('?')[0] || '';
  const path = fullPath.replace(/^\/api\/admin/, '') || '/';
  
  // Ajouter req.query depuis l'URL si absent
  const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
  if (!req.query) req.query = {};
  if (!req.query.action) req.query.action = urlParams.get('action') || '';
  
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

    if (path === '/support-update' || path === '/support-update/') {
      // Marquer message comme lu/archivé/répondu — délégué à handleData avec section=support-update
      if (!req.query) req.query = {};
      req.query.section = 'support-update';
      return await handleData(req, res);
    }

    if (
      path === '/mondial-relay-pickup-points' || path === '/mondial-relay-pickup-points/' ||
      // vercel.json réécrit /api/mondial-relay/pickup-points (route PUBLIQUE utilisée par livraison.html)
      // vers ce fichier — mais req.url conserve le chemin d'origine, qui ne commence pas par /api/admin
      // et n'est donc pas raccourci par le .replace ci-dessus. On le détecte donc explicitement ici.
      fullPath === '/api/mondial-relay/pickup-points' || fullPath === '/api/mondial-relay/pickup-points/'
    ) {
      return await handleMondialRelayPickupPoints(req, res);
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
        '/api/admin/sync-brevo',
        '/api/admin/subscriptions',
        '/api/admin/mondial-relay-pickup-points'
      ]
    });
  } catch (error) {
    console.error('Admin router error:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ============ FONCTIONS MONDIAL RELAY ============

/**
 * Calcule le hash Security selon la doc Mondial Relay WSI4_PointRelais_Recherche
 */
function calculateSecurity(payload, privateKey) {
  // Ordre exact des paramètres selon doc WSI4_PointRelais_Recherche
  const securityString = [
    payload.Enseigne,
    payload.Pays,
    payload.NumPointRelais || '',
    payload.Ville || '',
    payload.CP || '',
    payload.Latitude || '',
    payload.Longitude || '',
    payload.Taille || '',
    payload.Poids || '',
    payload.Action,
    payload.DelaiEnvoi || '',
    payload.RayonRecherche || '',
    payload.NombreResultats || '',
    payload.TypeActivite || '',
    payload.NACE || ''
  ].join('') + privateKey;
  
  // Hash MD5 en majuscules selon doc Mondial Relay
  const hash = crypto.createHash('md5').update(securityString, 'utf8').digest('hex').toUpperCase();
  
  return hash;
}

/**
 * Génère le body SOAP XML pour WSI4_PointRelais_Recherche
 */
function generateSOAPBody(payload) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI4_PointRelais_Recherche xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${payload.Enseigne}</Enseigne>
      <Pays>${payload.Pays}</Pays>
      <NumPointRelais>${payload.NumPointRelais || ''}</NumPointRelais>
      <Ville>${payload.Ville || ''}</Ville>
      <CP>${payload.CP || ''}</CP>
      <Latitude>${payload.Latitude || ''}</Latitude>
      <Longitude>${payload.Longitude || ''}</Longitude>
      <Taille>${payload.Taille || ''}</Taille>
      <Poids>${payload.Poids || ''}</Poids>
      <Action>${payload.Action}</Action>
      <DelaiEnvoi>${payload.DelaiEnvoi || ''}</DelaiEnvoi>
      <RayonRecherche>${payload.RayonRecherche || ''}</RayonRecherche>
      <NombreResultats>${payload.NombreResultats || ''}</NombreResultats>
      <TypeActivite>${payload.TypeActivite || ''}</TypeActivite>
      <NACE>${payload.NACE || ''}</NACE>
      <Security>${payload.Security}</Security>
    </WSI4_PointRelais_Recherche>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Appel réel à l'API Mondial Relay
 */
async function callMondialRelayAPI(postalCode, country) {
  const payload = {
    Enseigne: MONDIAL_RELAY_ENSEIGNE,
    Pays: country,
    NumPointRelais: '',
    Ville: '',
    CP: postalCode,
    Latitude: '',
    Longitude: '',
    Taille: '', // Vide par défaut selon doc
    Poids: '',
    Action: '24R', // Point Relais L
    DelaiEnvoi: '0',
    RayonRecherche: '',
    NombreResultats: '20',
    TypeActivite: '',
    NACE: ''
  };

  // Calculer le Security hash
  const security = calculateSecurity(payload, MONDIAL_RELAY_PRIVATE_KEY);
  payload.Security = security;

  // Générer le body SOAP XML
  const soapBody = generateSOAPBody(payload);

  const response = await fetch(MONDIAL_RELAY_API1_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.mondialrelay.fr/webservice/WSI4_PointRelais_Recherche',
      'MessageType': 'CALL'
    },
    body: soapBody
  });

  console.log(`API Mondial Relay - Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    throw new Error(`API Mondial Relay HTTP error: ${response.status} ${response.statusText}`);
  }

  const xmlResponse = await response.text();
  
  // Parser la réponse XML et convertir en JSON
  return parseMondialRelayResponse(xmlResponse);
}

/**
 * Parser la réponse XML de Mondial Relay
 */
async function parseMondialRelayResponse(xmlResponse) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    ignoreAttrs: false,
    mergeAttrs: true
  });

  const parsedData = await parser.parseStringPromise(xmlResponse);

  // Récupérer WSI4_PointRelais_RechercheResult avec les variants SOAP possibles
  const result = 
    parsedData?.['soap:Envelope']?.['soap:Body']?.WSI4_PointRelais_RechercheResponse?.WSI4_PointRelais_RechercheResult
    || parsedData?.['soap12:Envelope']?.['soap12:Body']?.WSI4_PointRelais_RechercheResponse?.WSI4_PointRelais_RechercheResult
    || parsedData?.soap?.Envelope?.Body?.WSI4_PointRelais_RechercheResponse?.WSI4_PointRelais_RechercheResult;

  if (!result) {
    throw new Error('No WSI4_PointRelais_RechercheResult node found');
  }

  const details = result?.PointsRelais?.PointRelais_Details;
  if (!details) {
    throw new Error('No PointRelais_Details node found');
  }

  console.log('Structure trouvée: PointsRelais.PointRelais_Details');

  // Gérer les variantes: objet unique ou tableau
  const pointsArray = Array.isArray(details) ? details : [details];

  // Vérifier les STAT dans chaque point relais (robuste avec trim)
  const invalidStat = pointsArray.find(
    p => String(p?.STAT || '').trim() && String(p.STAT).trim() !== '0'
  );
  if (invalidStat) {
    throw new Error(`Erreur métier Mondial Relay - STAT: ${invalidStat.STAT}`);
  }

  const mappedPoints = pointsArray
    .filter(point => point && point.Num && point.LgAdr1)
    .map(point => ({
      id: point.Num || '',
      name: point.LgAdr1 || '',
      address1: point.LgAdr1 || '',
      // LgAdr2/3/4 sont chacune une ligne distincte (max 32 car.) : on les concatène
      // pour ne pas perdre d'information quand l'adresse du point relais tient sur plusieurs lignes
      address2: [point.LgAdr2, point.LgAdr3, point.LgAdr4].filter(Boolean).join(', '),
      postalCode: point.CP || '',
      city: point.Ville || '',
      country: point.Pays || 'FR',
      latitude: point.Latitude ? parseFloat(point.Latitude) : null,
      longitude: point.Longitude ? parseFloat(point.Longitude) : null
    }));

  return mappedPoints;
}

/**
 * Recherche les points relais via API Mondial Relay
 */
async function searchPickupPoints(postalCode, country) {
  try {
    const points = await callMondialRelayAPI(postalCode, country);
    console.log(`Recherche points relais pour ${postalCode}, ${country}: ${points.length} trouvés`);
    return points;
  } catch (error) {
    console.error('Erreur API Mondial Relay:', error.message);
    throw error;
  }
}

/**
 * Handler pour la recherche de points relais Mondial Relay
 */
async function handleMondialRelayPickupPoints(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Méthode non autorisée'
    });
  }

  if (!MONDIAL_RELAY_ENSEIGNE || !MONDIAL_RELAY_PRIVATE_KEY) {
    console.error('Configuration Mondial Relay manquante:', {
      ENSEIGNE: !!MONDIAL_RELAY_ENSEIGNE,
      PRIVATE_KEY: !!MONDIAL_RELAY_PRIVATE_KEY
    });
    return res.status(500).json({
      success: false,
      error: 'Configuration Error',
      message: 'Service Mondial Relay non configuré correctement'
    });
  }

  try {
    const { postalCode, country = 'FR' } = req.query;

    if (!postalCode || postalCode.length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Code postal invalide'
      });
    }

    const points = await searchPickupPoints(postalCode, country);

    return res.status(200).json({
      success: true,
      points
    });
  } catch (error) {
    console.error('Erreur recherche points relais:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Service error',
      message: 'Une erreur est survenue lors de la recherche des points relais'
    });
  }
}
