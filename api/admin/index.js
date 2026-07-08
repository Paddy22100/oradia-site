// api/admin/index.js
// Routeur unifié pour toutes les fonctions admin
// Gère: auth, data, contacts-export, newsletter, newsletter-images, sync-brevo

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { parse: parseCookie, serialize: serializeCookie } = require('cookie');
const xml2js = require('xml2js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sendBrevoEmail, sendShippingEmail, sendExportEmail, sendReadyEmail } = require('../../lib/brevo-order-email.js');

// Manifest statique des illustrations du Tore (généré une fois, fichier unique et léger —
// ne pas remplacer par un fs.readdir sur /images, ça ferait bundler tout le dossier (350+ Mo)
// et dépasserait la limite de taille des fonctions Vercel.
let NL_LIBRARY_IMAGES = [];
try {
  NL_LIBRARY_IMAGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'newsletter-images-manifest.json'), 'utf8'));
} catch (e) {
  console.error('Impossible de charger newsletter-images-manifest.json:', e.message);
}

// Tables exportables (récap mensuel preorders/donors/tirages)
const EXPORTABLE_TABLES = ['preorders', 'donors', 'tirages'];

// Comptes à ne jamais compter dans la comptabilité (audit/test + compte personnel du fondateur)
const ACCOUNTING_EXCLUDED_EMAILS = ['boucheron.r89@gmail.com', 'audit@oradia.fr', 'contact@oradia.fr'];

// Catégories de contacts newsletter (utilisées pour cibler les envois depuis le dashboard,
// sans passer par les listes Brevo). Liste indicative — des tags libres restent possibles.
const CONTACT_TAGS = [
  { value: 'general',    label: 'Liste générale',  system: true },
  { value: 'therapeute', label: 'Thérapeutes',      system: true },
  { value: 'prospect',   label: 'Prospects Oracle', system: true },
  { value: 'presse',     label: 'Presse / médias',  system: true },
  { value: 'communaute', label: 'Communauté',        system: true }
];

async function logSystemEvent(sb, { level='info', source, method, path, status_code, message, details }) {
    try {
        const supabaseLog = sb || require('@supabase/supabase-js').createClient(
            process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        await supabaseLog.from('system_logs').insert({ level, source, method, path, status_code, message, details: details || null });
    } catch (_) {}
}

// Synchronise un contact avec Brevo : seuls les contacts de la catégorie "general"
// sont ajoutés à la liste 5 (newsletter principale). Les autres catégories sont
// gérées uniquement depuis le dashboard (envois ciblés directs, sans liste Brevo).
// Si un contact perd la catégorie "general", il est retiré de la liste 5.
async function syncContactToBrevo(supabase, BREVO_API_KEY, contact) {
  if (!BREVO_API_KEY || !contact?.email) return;
  const isGeneral = (contact.tags || []).includes('general');
  try {
    if (isGeneral) {
      const r = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
        body: JSON.stringify({
          email: contact.email,
          listIds: [5],
          updateEnabled: true,
          attributes: { ORADIA_INSCRIPTION: contact.created_at || new Date().toISOString() }
        })
      });
      if (!r.ok && r.status !== 409) {
        console.warn('Brevo sync (add) échoué pour', contact.email, r.status);
        return;
      }
    } else {
      await fetch('https://api.brevo.com/v3/contacts/lists/5/contacts/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
        body: JSON.stringify({ emails: [contact.email] })
      }).catch(() => {});
    }
    await supabase
      .from('newsletter_contacts')
      .update({ brevo_synced: true, brevo_synced_at: new Date().toISOString() })
      .eq('id', contact.id);
  } catch (e) {
    console.error('Brevo sync error for', contact.email, e.message);
  }
}

// Convertit un tableau d'objets en CSV (échappement basique des guillemets/virgules)
function rowsToCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map(c => escape(row[c])).join(','));
  }
  return lines.join('\n');
}

// Récupère toutes les lignes d'une table (pagination Supabase par lots de 1000)
async function fetchAllRows(supabase, table) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
  } catch (err) {
    const e = new Error('Session expirée, merci de vous reconnecter');
    e.statusCode = 401;
    throw e;
  }

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
    // Les tâches automatiques quotidiennes (GitHub Actions) s'authentifient via
    // un secret partagé plutôt qu'une session admin (pas de cookie/JWT dans un cron).
    const cronSecret    = req.headers['x-cron-secret'];
    const vercelCronSig = req.headers['x-vercel-cron-signature'];
    const vercelCron    = req.headers['x-vercel-cron'];
    const cronQs        = req.query?.cron_secret;
    const isCronRequest =
      (!!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) ||
      (!!process.env.CRON_SECRET && cronQs     === process.env.CRON_SECRET) ||
      !!vercelCronSig ||
      vercelCron === '1';

    if (!isCronRequest) {
      verifyAdminAuth(req);
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ── Cron via GET (Vercel Cron Jobs) ──
    if (isCronRequest && req.method === 'GET') {
      const getAction = req.query?.action;
      if (getAction === 'cron-relance') {
        return await handleCronRelance(supabase, res);
      }
      if (getAction === 'cron-send-scheduled') {
        try {
          const { data: due } = await supabase
            .from('newsletter_drafts')
            .select('*')
            .neq('statut', 'envoyé')
            .not('scheduled_at', 'is', null)
            .lte('scheduled_at', new Date().toISOString())
            .limit(5);
          if (!due || due.length === 0) return res.status(200).json({ success: true, sent: 0 });
          const BREVO_API_KEY = process.env.BREVO_API_KEY;
          if (!BREVO_API_KEY) return res.status(200).json({ success: false, error: 'BREVO_API_KEY manquante' });
          const results = [];
          for (const draft of due) {
            try {
              const finalSubject = draft.subject || 'Oradia';
              const html = buildCommunicationEmailHtml({ ...draft, subject: finalSubject });
              const campRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
                body: JSON.stringify({
                  name: `${draft.type === 'promo' ? 'Promo' : 'Newsletter'} — ${finalSubject} — ${new Date().toISOString()}`,
                  subject: finalSubject,
                  sender: { name: 'Oradia', email: 'contact@oradia.fr' },
                  htmlContent: html,
                  recipients: { listIds: [5] }
                })
              });
              if (!campRes.ok) { results.push({ id: draft.id, ok: false }); continue; }
              const camp = await campRes.json();
              await fetch(`https://api.brevo.com/v3/emailCampaigns/${camp.id}/sendNow`, {
                method: 'POST', headers: { 'api-key': BREVO_API_KEY }
              });
              await supabase.from('newsletter_drafts')
                .update({ statut: 'envoyé', sent_at: new Date().toISOString(), scheduled_at: null })
                .eq('id', draft.id);
              results.push({ id: draft.id, ok: true });
            } catch(e) { results.push({ id: draft.id, ok: false, error: e.message }); }
          }
          return res.status(200).json({ success: true, sent: results.filter(r=>r.ok).length, results });
        } catch(e) {
          return res.status(200).json({ success: false, error: e.message });
        }
      }
      if (getAction === 'cron-fetch-logs') {
        const sb = supabase;
        try {
            const token = process.env.VERCEL_TOKEN;
            const projectId = process.env.VERCEL_PROJECT_ID || 'prj_0DJh0iGvBHlRVp6MfrTCUa53Yhkd';
            const teamId = process.env.VERCEL_TEAM_ID || 'team_OH3FH8jY7Lx9tjNcayHH42xg';
            if (!token) return res.status(200).json({ success: true, message: 'VERCEL_TOKEN manquant' });
            // Récupérer le dernier déploiement
            const depRes = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=1&state=READY`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const depData = await depRes.json();
            const deployment = (depData.deployments || [])[0];
            if (!deployment) return res.status(200).json({ success: true, message: 'Aucun déploiement trouvé' });
            // Récupérer les events du déploiement (dernière heure)
            const since = Date.now() - 3600000;
            const evRes = await fetch(`https://api.vercel.com/v2/deployments/${deployment.uid}/events?teamId=${teamId}&since=${since}&limit=100`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const events = await evRes.json();
            const crypto = require('crypto');
            const candidateLogs = (Array.isArray(events) ? events : [])
                .filter(e => e.type === 'stderr' || e.type === 'error')
                .map(e => {
                    const msg = typeof e.payload === 'string' ? e.payload.slice(0,500) : JSON.stringify(e.payload).slice(0,500);
                    const eventKey = crypto.createHash('md5').update(`${deployment.uid}:${e.created || ''}:${msg}`).digest('hex');
                    return {
                        level: 'error',
                        source: 'vercel-cron',
                        path: deployment.url,
                        message: msg,
                        details: { deployment_id: deployment.uid, event_type: e.type, event_key: eventKey }
                    };
                });

            // Déduplication : ignorer les events déjà enregistrés (clé hash sur deployment+timestamp+message)
            let logsToInsert = candidateLogs;
            if (candidateLogs.length > 0) {
                const { data: existing } = await sb
                    .from('system_logs')
                    .select('details')
                    .eq('source', 'vercel-cron')
                    .gte('created_at', new Date(since).toISOString())
                    .limit(500);
                const existingKeys = new Set((existing || []).map(r => r.details?.event_key).filter(Boolean));
                logsToInsert = candidateLogs.filter(l => !existingKeys.has(l.details.event_key));
            }

            if (logsToInsert.length > 0) {
                await sb.from('system_logs').insert(logsToInsert);
            }
            await logSystemEvent(sb, { level:'info', source:'cron-fetch-logs', message:`Cron logs: ${logsToInsert.length} nouvelles erreurs (${candidateLogs.length} détectées, ${candidateLogs.length - logsToInsert.length} doublons ignorés)`, details: { deployment: deployment.uid } });
            return res.status(200).json({ success: true, fetched: logsToInsert.length, total_detected: candidateLogs.length });
        } catch(e) {
            await logSystemEvent(supabase, { level:'error', source:'cron-fetch-logs', message: e.message });
            return res.status(200).json({ success: false, error: e.message });
        }
      }
      if (getAction === 'cron-monthly-report') {
        try {
          const adminEmail = process.env.ADMIN_EMAIL;
          const BREVO_API_KEY = process.env.BREVO_API_KEY;
          if (!adminEmail || !BREVO_API_KEY) return res.status(200).json({ success: false, message: 'ADMIN_EMAIL ou BREVO_API_KEY manquant' });
          const now = new Date();
          const testCurrentMonth = req.query?.test_current_month === '1';
          const offset = testCurrentMonth ? 0 : -1;
          const monthStart = new Date(now.getFullYear(), now.getMonth() + offset, 1).toISOString();
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1).toISOString();
          const monthLabel = new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) + (testCurrentMonth ? ' (en cours — test)' : '');
          const { data: txs } = await supabase.from('transactions').select('type,category,amount,source').gte('date', monthStart.slice(0,10)).lt('date', monthEnd.slice(0,10));
          const recetteRows = (txs||[]).filter(t => t.type === 'recette');
          const depenseRows = (txs||[]).filter(t => t.type === 'depense');
          const totalRecettes = recetteRows.reduce((s,t) => s + parseFloat(t.amount), 0);
          const totalDepenses = depenseRows.reduce((s,t) => s + parseFloat(t.amount), 0);
          const recBIC = recetteRows.filter(t => t.source === 'precommande' || t.source === 'abonnement').reduce((s,t) => s + parseFloat(t.amount), 0);
          const recBNC = totalRecettes - recBIC;
          const urssaf = recBIC * 0.123 + recBNC * 0.211;
          const STRIPE_SOURCES = ['precommande', 'abonnement', 'don', 'guidance'];
          const stripeRows = recetteRows.filter(t => STRIPE_SOURCES.includes(t.source));
          const stripeFeesEstimate = stripeRows.reduce((s,t) => s + parseFloat(t.amount) * 0.014 + 0.25, 0);
          const tresorerieReelle = totalRecettes - stripeFeesEstimate - totalDepenses;
          const fmt = v => new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR' }).format(v);
          const byCategory = {};
          recetteRows.forEach(t => { byCategory[t.category||t.source] = (byCategory[t.category||t.source]||0) + parseFloat(t.amount); });
          const { count: activeSubs } = await supabase.from('tore_subscriptions').select('*',{count:'exact',head:true}).eq('status','active');
          const { count: newContacts } = await supabase.from('newsletter_contacts').select('*',{count:'exact',head:true}).gte('created_at', monthStart).lt('created_at', monthEnd);
          const { data: views } = await supabase.from('page_views').select('session_id').gte('created_at', monthStart).lt('created_at', monthEnd);
          const totalViews = (views||[]).length;
          const uniqueVisitors = new Set((views||[]).map(v=>v.session_id)).size;
          const { count: errors } = await supabase.from('system_logs').select('*',{count:'exact',head:true}).eq('level','error').gte('created_at', monthStart).lt('created_at', monthEnd);
          const catRows = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => `<tr><td style="padding:6px 12px;color:#d1c9b0;">${cat}</td><td style="padding:6px 12px;text-align:right;color:#f0c75e;font-weight:600;">${fmt(amt)}</td></tr>`).join('');
          const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
          const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#050a14;font-family:Georgia,serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#050a14;padding:40px 20px;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a1628;border:1px solid rgba(212,175,55,0.25);border-radius:6px;"><tr><td style="padding:40px 40px 24px;border-bottom:1px solid rgba(212,175,55,0.1);"><p style="margin:0 0 4px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.4em;text-transform:uppercase;">Rapport mensuel</p><h1 style="margin:0;color:#f0c75e;font-size:26px;font-weight:300;">ORADIA — ${cap(monthLabel)}</h1></td></tr><tr><td style="padding:32px 40px;"><p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;">Comptabilité</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.05);border-radius:4px;margin-bottom:28px;"><tr><td style="padding:12px;"><table width="100%">${catRows||'<tr><td style="padding:6px;color:#d1c9b0;">Aucune transaction ce mois</td></tr>'}</table></td></tr><tr><td style="padding:4px 12px;border-top:1px solid rgba(212,175,55,0.1);"><table width="100%"><tr><td style="padding:8px 0;color:#d1c9b0;font-size:13px;">Total recettes</td><td style="text-align:right;color:#4ade80;font-weight:700;">${fmt(totalRecettes)}</td></tr><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">Total dépenses</td><td style="text-align:right;color:#f87171;">${fmt(totalDepenses)}</td></tr><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;font-weight:600;">Résultat net</td><td style="text-align:right;color:#f0c75e;font-weight:700;">${fmt(totalRecettes-totalDepenses)}</td></tr></table></td></tr></table><p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;">URSSAF (micro-entrepreneur)</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.05);border-radius:4px;margin-bottom:28px;"><tr><td style="padding:16px 12px;"><table width="100%"><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">BIC 12,3% sur ${fmt(recBIC)}</td><td style="text-align:right;color:#e8c96a;">${fmt(recBIC*0.123)}</td></tr><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">BNC 21,1% sur ${fmt(recBNC)}</td><td style="text-align:right;color:#e8c96a;">${fmt(recBNC*0.211)}</td></tr><tr><td style="padding:8px 0 4px;color:#f0c75e;font-size:14px;font-weight:600;border-top:1px solid rgba(212,175,55,0.15);">Total cotisations estimées</td><td style="text-align:right;color:#f0c75e;font-weight:700;font-size:16px;border-top:1px solid rgba(212,175,55,0.15);">${fmt(urssaf)}</td></tr></table></td></tr></table><div style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.25);border-radius:4px;padding:14px 16px;margin-bottom:28px;"><p style="margin:0 0 6px;color:#f87171;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">⚠️ Ce que vous devez déclarer à l'URSSAF</p><p style="margin:0 0 8px;color:#d1c9b0;font-size:12.5px;line-height:1.6;">Le montant brut encaissé par le client — <strong>pas</strong> le net après commission Stripe. Les frais Stripe ne sont pas déductibles en micro-entreprise (l'abattement forfaitaire joue déjà ce rôle au moment de l'impôt sur le revenu).</p><p style="margin:0;color:#e8c96a;font-size:13px;font-weight:600;">Montant à déclarer ce mois-ci : ${fmt(totalRecettes)} (et non ${fmt(tresorerieReelle)})</p></div><p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;">Trésorerie réelle (information seule)</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.05);border-radius:4px;margin-bottom:28px;"><tr><td style="padding:16px 12px;"><table width="100%"><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">Frais Stripe estimés (1,4% + 0,25€/transaction)</td><td style="text-align:right;color:#f87171;">− ${fmt(stripeFeesEstimate)}</td></tr><tr><td style="padding:8px 0 4px;color:#f0c75e;font-size:14px;font-weight:600;border-top:1px solid rgba(212,175,55,0.15);">Trésorerie réelle estimée</td><td style="text-align:right;color:#2dd4bf;font-weight:700;font-size:16px;border-top:1px solid rgba(212,175,55,0.15);">${fmt(tresorerieReelle)}</td></tr></table></td></tr></table><p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;">Activité du site</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.05);border-radius:4px;margin-bottom:28px;"><tr><td style="padding:16px 12px;"><table width="100%"><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Pages vues</td><td style="text-align:right;color:#2dd4bf;font-weight:600;">${totalViews}</td></tr><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Visiteurs uniques</td><td style="text-align:right;color:#2dd4bf;font-weight:600;">${uniqueVisitors}</td></tr><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Abonnés Tore actifs</td><td style="text-align:right;color:#f0c75e;font-weight:600;">${activeSubs||0}</td></tr><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Nouveaux contacts</td><td style="text-align:right;color:#f0c75e;font-weight:600;">+${newContacts||0}</td></tr><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Erreurs techniques</td><td style="text-align:right;color:${(errors||0)>0?'#f87171':'#4ade80'};font-weight:600;">${errors||0}</td></tr></table></td></tr></table><p style="margin:0;color:rgba(212,175,55,0.3);font-size:11px;text-align:center;font-style:italic;">Rapport automatique · oradia.fr/admin</p></td></tr></table></td></tr></table></body></html>`;
          const r = await fetch('https://api.brevo.com/v3/smtp/email', { method:'POST', headers:{'Content-Type':'application/json','api-key':BREVO_API_KEY}, body: JSON.stringify({ sender:{email:'contact@oradia.fr',name:'ORADIA Dashboard'}, to:[{email:adminEmail}], subject:`📊 Rapport mensuel ORADIA — ${cap(monthLabel)}`, htmlContent: html }) });
          return res.status(200).json({ success: r.ok, status: r.status });
        } catch(e) { return res.status(200).json({ success: false, error: e.message }); }
      }
      return res.status(403).json({ error: 'Action non autorisée' });
    }

    // ── POST : actions sur abonnements ──
    if (req.method === 'POST') {
      const body = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', c => d += c);
        req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
        req.on('error', reject);
      });

      const { action, email, fullName, accessCode, expiresAt, subscriptionId, isFree } = body;

      // ── Action réservée aux tâches automatiques (cron quotidien) ──
      if (isCronRequest) {
        if (action === 'mr-check-deliveries') {
          return await checkMondialRelayDeliveries(supabase, res);
        }
        if (action === 'monthly-export-email') {
          if (!process.env.ADMIN_EMAIL) {
            return res.status(200).json({ success: false, message: 'ADMIN_EMAIL non configuré' });
          }
          const files = [];
          for (const table of EXPORTABLE_TABLES) {
            const rows = await fetchAllRows(supabase, table);
            files.push({ name: `${table}.csv`, content: rowsToCsv(rows) });
          }
          const sent = await sendExportEmail({ toEmail: process.env.ADMIN_EMAIL, files });
          return res.status(200).json({ success: sent });
        }
        return res.status(403).json({ error: 'Action non autorisée' });
      }

      if (action === 'create' && email) {
        const { error } = await supabase
          .from('tore_subscriptions')
          .upsert({
            email: email.toLowerCase().trim(),
            full_name: fullName || '',
            access_code: accessCode || ('ADMIN-' + Date.now().toString(36).toUpperCase()),
            expires_at: expiresAt || null,
            status: 'active',
            is_free: !!isFree,
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

      if (action === 'manual-relance' && body.toreEmailId) {
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configuré' });

        const { data: contact, error: cErr } = await supabase
          .from('tore_emails')
          .select('id, email, relance_j1_sent, relance_j4_sent, relance_j10_sent, unsubscribed')
          .eq('id', body.toreEmailId)
          .maybeSingle();
        if (cErr) throw cErr;
        if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
        if (contact.unsubscribed) return res.status(400).json({ error: 'Contact désabonné' });

        // Détermine le prochain template à envoyer dans l'ordre J+1 → J+4 → J+10
        let field, sentAt, templateEnv, templateLabel;
        if (!contact.relance_j1_sent) {
          field = 'relance_j1_sent'; sentAt = 'relance_j1_sent_at'; templateEnv = 'BREVO_TEMPLATE_J1'; templateLabel = 'J+1';
        } else if (!contact.relance_j4_sent) {
          field = 'relance_j4_sent'; sentAt = 'relance_j4_sent_at'; templateEnv = 'BREVO_TEMPLATE_J4'; templateLabel = 'J+4';
        } else if (!contact.relance_j10_sent) {
          field = 'relance_j10_sent'; sentAt = 'relance_j10_sent_at'; templateEnv = 'BREVO_TEMPLATE_J10'; templateLabel = 'J+10';
        } else {
          return res.status(400).json({ error: 'Séquence déjà complète pour ce contact' });
        }

        const templateId = parseInt(process.env[templateEnv] || '0', 10);
        if (!templateId) return res.status(500).json({ error: `${templateEnv} non configuré` });

        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, to: [{ email: contact.email }] })
        });
        if (!brevoRes.ok) {
          const txt = await brevoRes.text();
          throw new Error(`Brevo ${brevoRes.status}: ${txt}`);
        }

        await supabase.from('tore_emails').update({
          [field]: true,
          [sentAt]: new Date().toISOString()
        }).eq('id', contact.id);

        return res.status(200).json({ success: true, template: templateLabel, email: contact.email });
      }

      if (action === 'upgrade_plan' && subscriptionId) {
        const newPlan = body.plan || 'complet';
        const { error } = await supabase
          .from('tore_subscriptions')
          .update({ plan: newPlan, updated_at: new Date().toISOString() })
          .eq('id', subscriptionId);
        if (error) throw error;
        return res.status(200).json({ success: true, plan: newPlan });
      }

      if (action === 'resend_code' && subscriptionId) {
        return res.status(200).json({ success: true, emailSent: false, message: 'Fonction email non configurée' });
      }

      // Marquer une précommande comme expédiée — envoie automatiquement
      // l'email "commande en chemin" au client (remplace l'ancien envoi manuel).
      if (action === 'mark-shipped' && body.orderId && body.trackingNumber) {
        const { data: order, error: fetchError } = await supabase
          .from('preorders')
          .select('*')
          .eq('id', body.orderId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!order) return res.status(404).json({ error: 'Commande introuvable' });

        const { error: updateError } = await supabase
          .from('preorders')
          .update({
            shipping_status: 'shipped',
            tracking_number: body.trackingNumber,
            shipment_number: body.shipmentNumber || null,
            shipped_at: new Date().toISOString()
          })
          .eq('id', body.orderId);
        if (updateError) throw updateError;

        let emailSent = false;
        if (order.email) {
          emailSent = await sendShippingEmail({
            toEmail: order.email,
            toName: order.full_name || 'Client ORADIA',
            trackingNumber: body.trackingNumber
          });
        }

        return res.status(200).json({ success: true, emailSent });
      }

      // Marquer une précommande comme payée manuellement + renvoyer l'email de confirmation.
      // Utilisé quand le webhook Stripe a échoué (paid_status reste 'pending' malgré le paiement réel).
      if (action === 'mark-paid' && body.orderId) {
        const { data: order, error: fetchError } = await supabase
          .from('preorders')
          .select('*')
          .eq('id', body.orderId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!order) return res.status(404).json({ error: 'Commande introuvable' });

        const { error: updateError } = await supabase
          .from('preorders')
          .update({ paid_status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', body.orderId);
        if (updateError) throw updateError;

        let emailSent = false;
        if (order.email) {
          emailSent = await sendBrevoEmail({
            toEmail: order.email,
            toName: order.full_name || 'Ami(e) d\'ORADIA',
            offer: order.offer,
            amountTotal: Number(order.amount_total || 0).toFixed(2)
          });
          if (emailSent) {
            await supabase.from('preorders')
              .update({ email_sent_at: new Date().toISOString() })
              .eq('id', body.orderId);
          }
        }

        return res.status(200).json({ success: true, emailSent });
      }

      // Notifier le client que sa commande en main propre est prête.
      if (action === 'mark-ready' && body.orderId) {
        const { data: order, error: fetchError } = await supabase
          .from('preorders')
          .select('email, full_name')
          .eq('id', body.orderId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!order) return res.status(404).json({ error: 'Commande introuvable' });

        const { error: updateError } = await supabase
          .from('preorders')
          .update({ ready_at: new Date().toISOString() })
          .eq('id', body.orderId);
        if (updateError) throw updateError;

        const emailSent = await sendReadyEmail({
          toEmail: order.email,
          toName: order.full_name || ''
        });

        return res.status(200).json({ success: true, emailSent });
      }

      // Marquer une précommande comme livrée — clôture la commande.
      if (action === 'mark-delivered' && body.orderId) {
        const { error: updateError } = await supabase
          .from('preorders')
          .update({
            shipping_status: 'delivered',
            delivered_at: new Date().toISOString()
          })
          .eq('id', body.orderId);
        if (updateError) throw updateError;

        return res.status(200).json({ success: true });
      }

      // ── Contacts newsletter : ajout manuel depuis le dashboard ──
      if (action === 'add-contact') {
        const contactEmail = (body.email || '').toLowerCase().trim();
        if (!contactEmail) return res.status(400).json({ error: 'Email requis' });

        const tags = Array.isArray(body.tags) && body.tags.length ? body.tags : ['general'];
        const { data, error } = await supabase
          .from('newsletter_contacts')
          .upsert({
            email: contactEmail,
            full_name: (body.full_name || '').trim() || null,
            notes: (body.notes || '').trim() || null,
            phone: (body.phone || '').trim() || null,
            company: (body.company || '').trim() || null,
            address: (body.address || '').trim() || null,
            tags,
            source: 'manuel',
            status: 'active'
          }, { onConflict: 'email' })
          .select()
          .single();
        if (error) throw error;
        await syncContactToBrevo(supabase, process.env.BREVO_API_KEY, data);
        return res.status(200).json({ success: true, data });
      }

      // ── Contacts newsletter : mise à jour (tags, nom, notes, statut) ──
      if (action === 'update-contact') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'id requis' });

        const updates = {};
        if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : [];
        if (body.full_name !== undefined) updates.full_name = (body.full_name || '').trim() || null;
        if (body.notes !== undefined) updates.notes = (body.notes || '').trim() || null;
        if (body.status !== undefined) updates.status = body.status;
        if (body.phone !== undefined) updates.phone = (body.phone || '').trim() || null;
        if (body.company !== undefined) updates.company = (body.company || '').trim() || null;
        if (body.address !== undefined) updates.address = (body.address || '').trim() || null;

        const { data, error } = await supabase
          .from('newsletter_contacts')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        if (updates.tags !== undefined) await syncContactToBrevo(supabase, process.env.BREVO_API_KEY, data);
        return res.status(200).json({ success: true });
      }

      // ── Contacts newsletter : suppression ──
      if (action === 'delete-contact') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'id requis' });

        const { data: contact, error: fetchErr } = await supabase
          .from('newsletter_contacts')
          .select('id, email')
          .eq('id', id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;

        const { error } = await supabase.from('newsletter_contacts').delete().eq('id', id);
        if (error) throw error;

        // Supprime également le contact de Brevo (toutes listes) pour rester synchronisé.
        let brevoDeleted = false;
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (contact?.email && BREVO_API_KEY) {
          try {
            const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(contact.email)}`, {
              method: 'DELETE',
              headers: { 'api-key': BREVO_API_KEY }
            });
            brevoDeleted = r.ok || r.status === 404;
          } catch (e) {
            console.error('Brevo delete error for', contact.email, e.message);
          }
        }

        return res.status(200).json({ success: true, brevoDeleted });
      }

      // ── Contacts : supprimer un tag de tous les contacts ──
      if (action === 'delete-tag') {
        const { tagValue } = body;
        if (!tagValue) return res.status(400).json({ error: 'tagValue requis' });
        if (CONTACT_TAGS.find(t => t.value === tagValue)) {
          return res.status(400).json({ error: 'Impossible de supprimer un tag système' });
        }
        const { data: affected, error: fetchErr } = await supabase
          .from('newsletter_contacts').select('id, tags').contains('tags', [tagValue]);
        if (fetchErr) throw fetchErr;
        let updatedCount = 0;
        for (const contact of (affected || [])) {
          const newTags = (contact.tags || []).filter(t => t !== tagValue);
          const { error: updateErr } = await supabase
            .from('newsletter_contacts').update({ tags: newTags }).eq('id', contact.id);
          if (!updateErr) updatedCount++;
        }
        return res.status(200).json({ success: true, updatedCount });
      }

      // ── Contacts : renommer un tag sur tous les contacts ──
      if (action === 'rename-tag') {
        const { oldValue, newValue: rawNew } = body;
        if (!oldValue || !rawNew) return res.status(400).json({ error: 'oldValue et newValue requis' });
        if (CONTACT_TAGS.find(t => t.value === oldValue)) {
          return res.status(400).json({ error: 'Impossible de renommer un tag système' });
        }
        const newValue = rawNew.trim().toLowerCase().replace(/\s+/g, '_');
        if (!newValue) return res.status(400).json({ error: 'newValue invalide' });
        const { data: affected, error: fetchErr } = await supabase
          .from('newsletter_contacts').select('id, tags').contains('tags', [oldValue]);
        if (fetchErr) throw fetchErr;
        let updatedCount = 0;
        for (const contact of (affected || [])) {
          const newTags = (contact.tags || []).map(t => t === oldValue ? newValue : t);
          const { error: updateErr } = await supabase
            .from('newsletter_contacts').update({ tags: newTags }).eq('id', contact.id);
          if (!updateErr) updatedCount++;
        }
        return res.status(200).json({ success: true, updatedCount });
      }

      if (action === 'import-transactions') {
        const sb = supabase;
        const isExcluded = (email) => email && ACCOUNTING_EXCLUDED_EMAILS.includes(String(email).toLowerCase().trim());
        // Import depuis preorders
        const { data: preorders } = await sb.from('preorders').select('created_at,amount_total,email,full_name,offer,stripe_session_id').eq('paid_status','completed');
        const { data: donors } = await sb.from('donors').select('created_at,amount,email,full_name,stripe_session_id');
        const { data: guidances } = await sb.from('guidances').select('created_at,amount,client_email,client_name,cal_booking_uid').in('status',['confirmed','completed']);
        const { data: subs } = await sb.from('tore_subscriptions').select('created_at,email,full_name,plan,status,is_free').neq('status','payment_failed');
        const planPriceEur = p => p === 'decouverte' ? 5 : 8;
        const toInsert = [
            ...(preorders||[]).filter(p=>!isExcluded(p.email)).map(p => ({ date: p.created_at?.split('T')[0], type:'recette', category:'précommande', description:`Précommande ${p.offer||''} — ${p.full_name||p.email||''}`, amount: parseFloat(p.amount_total)||0, source:'precommande', source_ref: p.stripe_session_id })).filter(t=>t.amount>0),
            ...(donors||[]).filter(d=>!isExcluded(d.email)).map(d => ({ date: d.created_at?.split('T')[0], type:'recette', category:'don', description:`Don — ${d.full_name||d.email||''}`, amount: parseFloat(d.amount)||0, source:'don', source_ref: d.stripe_session_id })).filter(t=>t.amount>0),
            ...(guidances||[]).filter(g=>!isExcluded(g.client_email)).map(g => ({ date: g.created_at?.split('T')[0], type:'recette', category:'guidance', description:`Guidance — ${g.client_name||g.client_email||''}`, amount: (g.amount||0)/100, source:'guidance', source_ref: g.cal_booking_uid })).filter(t=>t.amount>0),
            ...(subs||[]).filter(s=>!isExcluded(s.email) && !s.is_free).map(s => ({ date: s.created_at?.split('T')[0], type:'recette', category:'abonnement', description:`Abonnement Tore ${s.plan||'complet'} — ${s.full_name||s.email||''}`, amount: planPriceEur(s.plan), source:'abonnement', source_ref: `sub_${s.email}_${s.created_at?.split('T')[0]}` })),
        ];
        // Purger les transactions des abonnements gratuits déjà importées avant que is_free soit posé
        const freeSubEmails = (subs||[]).filter(s=>s.is_free).map(s=>s.email);
        for (const email of freeSubEmails) {
          await sb.from('transactions').delete().eq('source','abonnement').ilike('source_ref', `sub_${email}_%`);
        }
        // Purger les transactions déjà importées pour les comptes exclus (audit/test, fondateur)
        for (const email of ACCOUNTING_EXCLUDED_EMAILS) {
          await sb.from('transactions').delete().ilike('description', `%${email}%`);
        }
        await sb.from('transactions').delete().ilike('description', '%compte audit test%');
        await sb.from('transactions').delete().ilike('description', '%Rudy BOUCHERON%');
        if (toInsert.length === 0) return res.status(200).json({ success: true, imported: 0 });
        const { error } = await sb.from('transactions').upsert(toInsert, { onConflict: 'source_ref', ignoreDuplicates: true });
        if (error) throw error;
        return res.status(200).json({ success: true, imported: toInsert.length });
      }

      return res.status(400).json({ error: 'Action invalide' });
    }

    const section = req.query?.section || 'all';

    // ── Export CSV à la demande (bouton "Télécharger" dans l'onglet Surveillance) ──
    if (section === 'export') {
      const table = req.query?.table;
      if (!EXPORTABLE_TABLES.includes(table)) {
        return res.status(400).json({ error: 'Table invalide' });
      }
      const rows = await fetchAllRows(supabase, table);
      const csv = rowsToCsv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${table}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(csv);
    }

    // ── Section abonnements Tore ──
    if (section === 'subscriptions') {
      const page   = parseInt(req.query?.page  || '1', 10);
      const limit  = parseInt(req.query?.limit || '15', 10);
      const status = req.query?.status || 'all';
      const plan   = req.query?.plan   || 'all';
      const q      = (req.query?.q || '').trim().toLowerCase();
      const offset = (page - 1) * limit;

      let query = supabase
        .from('tore_subscriptions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status !== 'all') query = query.eq('status', status);
      if (plan !== 'all') query = query.eq('plan', plan);
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

    // ── Section tore-emails (freemium relance) ──
    if (section === 'tore-emails') {
      const { data, error } = await supabase
        .from('tore_emails')
        .select('id, email, created_at, consent_marketing, relance_j1_sent, relance_j4_sent, relance_j10_sent, unsubscribed')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return res.status(200).json({ success: true, data: data || [] });
    }

    // ── Section user-tirages (tirages d'un abonné, pour modal admin) ──
    if (section === 'user-tirages') {
      const email = (req.query?.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'email requis' });
      // Jointure auth.users ↔ tirages côté SQL (SECURITY DEFINER — bypasse RLS et GoTrue)
      const { data: tirages, error: tErr } = await supabase
        .rpc('admin_get_tirages_by_email', { p_email: email });
      if (tErr) {
        console.error('[user-tirages] RPC error:', tErr);
        throw tErr;
      }
      return res.status(200).json({ success: true, data: tirages || [] });
    }

    // ── Section preorders ──
    if (section === 'preorders') {
      // Paramètre export=1 : retourne tous les enregistrements sans pagination (utilisé par le PDF)
      if (req.query?.export === '1') {
        const { data: allData, error: allError } = await supabase
          .from('preorders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
        if (allError) throw allError;
        return res.status(200).json({
          success: true,
          data: allData || [],
          pagination: { page: 1, limit: 500, total: allData?.length || 0, pages: 1 }
        });
      }

      const page   = parseInt(req.query?.page  || '1', 10);
      const limit  = parseInt(req.query?.limit || '10', 10);
      const offset = (page - 1) * limit;
      const status = req.query?.status || 'all';
      const period = req.query?.period || 'all';
      const offer  = req.query?.offer  || 'all';
      const q      = (req.query?.q || '').trim();

      let query = supabase
        .from('preorders')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (status !== 'all') query = query.eq('paid_status', status);
      if (offer  !== 'all') query = query.eq('offer', offer);
      if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);

      if (period !== 'all') {
        const now = new Date();
        const since = new Date(now);
        if (period === 'today') since.setHours(0, 0, 0, 0);
        else if (period === '7d') since.setDate(now.getDate() - 7);
        else if (period === '30d') since.setDate(now.getDate() - 30);
        query = query.gte('created_at', since.toISOString());
      }

      const { data, count, error } = await query.range(offset, offset + limit - 1);
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
    // ── Section coûts du site (temps réel + abonnements fixes) ──
    if (section === 'costs') {
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

      // Importer le tracker d'utilisation API
      const { getUsageStats } = require('../../lib/api-usage-tracker.js');

      // Récupérer les statistiques d'utilisation API réelles
      let apiStats = {
        totalCalls: 0,
        successfulCalls: 0,
        totalTokens: 0,
        totalCostEur: 0,
        byModel: {}
      };

      try {
        const statsResult = await getUsageStats(startOfMonth);
        if (statsResult.success) {
          apiStats = statsResult.data;
        }
      } catch (e) {
        console.warn('[Admin Data] Erreur récupération stats API:', e.message);
      }

      // Compter les tirages (utiliser les appels API réussis comme proxy, avec fallback)
      let tiragesCount = apiStats.successfulCalls;
      if (tiragesCount === 0) {
        // Fallback: compter depuis la table tirages
        const { count: fallbackCount, error: tiragesErr } = await supabase
          .from('tirages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfMonth);
        if (!tiragesErr && fallbackCount !== null) {
          tiragesCount = fallbackCount;
        }
      }

      // Fenêtres d'observation activées ce mois-ci → proxy du nombre d'appels QRNG (ANU).
      let qrngAnu = 0, qrngFallback = 0;
      {
        const { data: obsRows, error } = await supabase
          .from('observation_windows')
          .select('qrng_source')
          .gte('created_at', startOfMonth);
        if (!error) {
          qrngAnu = (obsRows || []).filter(r => r.qrng_source === 'anu').length;
          qrngFallback = (obsRows || []).filter(r => r.qrng_source && r.qrng_source !== 'anu').length;
        }
      }

      // Utiliser le coût réel calculé depuis les tokens, avec fallback sur l'estimation
      let claudeApiCostEstimate = apiStats.totalCostEur;
      if (claudeApiCostEstimate === 0) {
        // Fallback: estimation basée sur le nombre de tirages si pas de données réelles
        const COST_PER_AI_CALL_USD = 0.0053;
        const USD_TO_EUR = 0.92;
        claudeApiCostEstimate = tiragesCount * COST_PER_AI_CALL_USD * USD_TO_EUR;
      }

      // Abonnements fixes (saisis manuellement, à ajuster ici si les tarifs changent)
      const CLAUDE_PRO_MONTHLY_EUR = 21.59; // ~20 $/mois
      const GANDI_DOMAIN_ANNUAL_EUR = 28.78;
      const GANDI_LAST_PAID_AT = '2026-06-08';
      const gandiMonthlyEquivalent = GANDI_DOMAIN_ANNUAL_EUR / 12;

      const subscriptions = [
        {
          name: 'Claude Pro (abonnement)',
          amountEur: CLAUDE_PRO_MONTHLY_EUR,
          period: 'mensuel',
          note: 'Utilisé pour le développement / usage personnel'
        },
        {
          name: 'Nom de domaine (Gandi)',
          amountEur: GANDI_DOMAIN_ANNUAL_EUR,
          period: 'annuel',
          lastPaidAt: GANDI_LAST_PAID_AT,
          monthlyEquivalentEur: Math.round(gandiMonthlyEquivalent * 100) / 100
        }
      ];

      const totalMonthlyEstimate = claudeApiCostEstimate + CLAUDE_PRO_MONTHLY_EUR + gandiMonthlyEquivalent;

      return res.status(200).json({
        success: true,
        data: {
          period: {
            start: startOfMonth,
            label: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
          },
          usage: {
            tirages: tiragesCount || 0,
            claudeApiCalls: apiStats.totalCalls || 0,
            claudeApiCostEstimateEur: Math.round(claudeApiCostEstimate * 100) / 100,
            claudeApiTokens: apiStats.totalTokens || 0,
            claudeApiErrors: apiStats.errorCalls || 0,
            claudeApiFallbacks: apiStats.fallbackCalls || 0,
            claudeModels: apiStats.byModel || {},
            qrng: { anu: qrngAnu, fallback: qrngFallback, costEur: 0 } // l'API ANU QRNG est gratuite
          },
          subscriptions,
          totalMonthlyEstimateEur: Math.round(totalMonthlyEstimate * 100) / 100
        }
      });
    }

    // ── Section surveillance : dernier audit + état UptimeRobot ──
    if (section === 'monitoring') {
      // Historique des audits (le plus récent en premier)
      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(7);
      if (auditErr) console.warn('[Admin Data] Erreur audit_reports:', auditErr.message);

      // État UptimeRobot (nécessite UPTIMEROBOT_API_KEY en variable d'environnement Vercel)
      let uptime = null;
      const UPTIMEROBOT_API_KEY = process.env.UPTIMEROBOT_API_KEY;
      if (UPTIMEROBOT_API_KEY) {
        try {
          const urResponse = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
            body: new URLSearchParams({
              api_key: UPTIMEROBOT_API_KEY,
              format: 'json',
              logs: '0',
              custom_uptime_ratios: '7-30'
            })
          });
          const urData = await urResponse.json();
          if (urData.stat === 'ok') {
            uptime = {
              monitors: (urData.monitors || []).map(m => ({
                id: m.id,
                name: m.friendly_name,
                url: m.url,
                status: m.status, // 0=paused, 1=not checked, 2=up, 8=seems down, 9=down
                uptimeRatio7d: m.custom_uptime_ratio ? m.custom_uptime_ratio.split('-')[0] : null,
                uptimeRatio30d: m.custom_uptime_ratio ? m.custom_uptime_ratio.split('-')[1] : null
              }))
            };
          } else {
            uptime = { error: urData.error?.message || 'Erreur UptimeRobot' };
          }
        } catch (e) {
          uptime = { error: e.message };
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          audits: auditRows || [],
          uptime
        }
      });
    }

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
      const page             = parseInt(req.query?.page  || '1', 10);
      const limit            = parseInt(req.query?.limit || '10', 10);
      const tag              = (req.query?.tag || '').trim();
      const newsletterFilter = (req.query?.newsletter || '').trim();
      const offset = (page - 1) * limit;
      let query = supabase
        .from('newsletter_contacts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (tag) query = query.contains('tags', [tag]);
      if (newsletterFilter === 'newsletter') query = query.eq('brevo_synced', true).neq('status', 'unsubscribed');
      if (newsletterFilter === 'no-newsletter') query = query.or('brevo_synced.eq.false,status.eq.unsubscribed');
      const nlStatus = (req.query?.nl_status || new URLSearchParams(req.url?.split('?')[1] || '').get('nl_status') || '').trim();
      if (nlStatus === 'unsubscribed') query = query.eq('status', 'unsubscribed');
      const { data, count, error } = await query;
      // Si la table n'existe pas (PGRST205), retourner une liste vide au lieu d'une 500
      if (error) {
        console.warn('Waitlist section error (non-fatal):', error.message);
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { page, limit, total: 0, pages: 0 },
          availableTags: CONTACT_TAGS
        });
      }
      // Merger les tags hardcodés avec les tags personnalisés présents dans les données
      const knownTagValues = new Set(CONTACT_TAGS.map(t => t.value));
      const mergedTags = [...CONTACT_TAGS];
      (data || []).forEach(contact => {
        (contact.tags || []).forEach(tag => {
          if (!knownTagValues.has(tag)) {
            knownTagValues.add(tag);
            mergedTags.push({ value: tag, label: tag });
          }
        });
      });

      return res.status(200).json({
        success: true,
        data: data || [],
        pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
        availableTags: mergedTags
      });
    }

    // ── Section overview / all : agrégats KPI ──
    const [waitlistRes, preordersRes, donorsRes, singleDrawsRes, supportRes, syncRes, guidancesRes, subscriptionsRes] = await Promise.all([
      supabase.from('newsletter_contacts').select('*'),
      supabase.from('preorders').select('*'),
      supabase.from('donors').select('*'),
      supabase.from('tore_subscriptions').select('email, single_draw_credits, status').or('status.eq.single_draw,single_draw_credits.gt.0'),
      supabase.from('support_messages').select('id, type, status, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('synchronicity_responses').select('score_synchronicites', { count: 'exact', head: false }),
      supabase.from('guidances').select('id, amount, status, created_at').in('status', ['confirmed', 'completed']),
      supabase.from('tore_subscriptions').select('plan, status, is_free, created_at').neq('status', 'payment_failed').neq('status', 'single_draw').or('is_free.is.null,is_free.eq.false')
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

    // Calcul abonnements Tore (revenus totaux = chaque abonnement × son prix mensuel)
    const subscriptionRows = subscriptionsRes.data || [];
    const planPrice = p => p === 'decouverte' ? 5 : 8;
    const subscriptionsTotal = subscriptionRows.reduce((s, r) => s + planPrice(r.plan), 0);
    const subscriptionsActive = subscriptionRows.filter(r => r.status === 'active').length;

    // Calcul guidances
    const guidanceRows       = guidancesRes.data || [];
    const guidancesTotal     = guidanceRows.reduce((s, r) => s + ((r.amount || 0) / 100), 0);
    const guidancesConfirmed = guidanceRows.filter(r => r.status === 'confirmed').length;
    const guidancesCompleted = guidanceRows.filter(r => r.status === 'completed').length;
    const sumGuidances       = rows => rows.reduce((s, r) => s + ((r.amount || 0) / 100), 0);

    const now   = Date.now();
    const day1  = 24 * 3600 * 1000;
    const day7  = 7  * day1;
    const day30 = 30 * day1;

    const sumPreorders = (rows) => rows.reduce((s, r) => s + (parseFloat(r.amount_total) || parseFloat(r.amount) || 0), 0);
    const sumDonors    = (rows) => rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    // Séparer commandes payées et abandons (en attente / échouées)
    const paidPreorderRows      = preorderRows.filter(r => r.paid_status === 'completed');
    const abandonedPreorderRows = preorderRows.filter(r => r.paid_status !== 'completed' && r.email);

    const preordersToday = paidPreorderRows.filter(r => now - new Date(r.created_at).getTime() < day1);
    const preorders7d    = paidPreorderRows.filter(r => now - new Date(r.created_at).getTime() < day7);
    const preorders30d   = paidPreorderRows.filter(r => now - new Date(r.created_at).getTime() < day30);
    const donors7d       = donorRows.filter(r => now - new Date(r.created_at).getTime() < day7);
    const donors30d      = donorRows.filter(r => now - new Date(r.created_at).getTime() < day30);
    const guidancesToday = guidanceRows.filter(r => now - new Date(r.created_at).getTime() < day1);
    const guidances7d    = guidanceRows.filter(r => now - new Date(r.created_at).getTime() < day7);
    const guidances30d   = guidanceRows.filter(r => now - new Date(r.created_at).getTime() < day30);

    const preordersTotal  = sumPreorders(paidPreorderRows);
    const donorsTotal     = sumDonors(donorRows);
    const globalTotal     = preordersTotal + donorsTotal + singleDrawTotal + guidancesTotal + subscriptionsTotal;
    const totalContacts   = paidPreorderRows.length + donorRows.length + waitlistRows.length;
    const averageBasket   = paidPreorderRows.length > 0 ? preordersTotal / paidPreorderRows.length : 0;

    // Frais Stripe estimés : 1,5% + 0,25€/transaction (cartes européennes)
    const stripeFee     = (total, count) => Math.max(0, total * 0.015 + 0.25 * count);
    const preordersNet  = preordersTotal  - stripeFee(preordersTotal,  paidPreorderRows.length);
    const donorsNet     = donorsTotal     - stripeFee(donorsTotal,     donorRows.length);
    const singleDrawNet      = singleDrawTotal      - stripeFee(singleDrawTotal,      singleDrawCount);
    const guidancesNet       = guidancesTotal       - stripeFee(guidancesTotal,       guidanceRows.length);
    const subscriptionsNet   = subscriptionsTotal   - stripeFee(subscriptionsTotal,   subscriptionRows.length);
    const globalNet          = preordersNet + donorsNet + singleDrawNet + guidancesNet + subscriptionsNet;

    const donorsToday = donorRows.filter(r => now - new Date(r.created_at).getTime() < day1);
    const revToday    = sumPreorders(preordersToday) + sumDonors(donorsToday)  + sumGuidances(guidancesToday);
    const rev7d       = sumPreorders(preorders7d)    + sumDonors(donors7d)     + sumGuidances(guidances7d);
    const rev30d      = sumPreorders(preorders30d)   + sumDonors(donors30d)    + sumGuidances(guidances30d);
    const netRevToday = revToday - stripeFee(revToday, preordersToday.length + donorsToday.length + guidancesToday.length);
    const netRev7d    = rev7d    - stripeFee(rev7d,    preorders7d.length   + donors7d.length   + guidances7d.length);
    const netRev30d   = rev30d   - stripeFee(rev30d,   preorders30d.length  + donors30d.length  + guidances30d.length);

    // Nombre d'oracles commandés (somme des quantités dans items[], pas juste le nb de commandes)
    const countOracles = (rows) => rows.reduce((sum, r) => {
      if (Array.isArray(r.items) && r.items.length > 0) {
        const qty = r.items.reduce((s, item) => { const q = Number(item?.quantity); return s + (Number.isFinite(q) && q > 0 ? q : 0); }, 0);
        return sum + (qty > 0 ? qty : 1);
      }
      return sum + 1;
    }, 0);
    const oraclesCount = countOracles(paidPreorderRows);

    return res.status(200).json({
      success: true,
      data: {
        preorders: {
          count:        paidPreorderRows.length,
          oraclesCount,
          total:        preordersTotal,
          net:          preordersNet,
          noEmail:      paidPreorderRows.filter(r => !r.email).length,
          averageBasket,
          abandoned:    abandonedPreorderRows.length
        },
        donors: {
          count:   donorRows.length,
          total:   donorsTotal,
          net:     donorsNet,
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
        guidances: {
          count:     guidanceRows.length,
          confirmed: guidancesConfirmed,
          completed: guidancesCompleted,
          total:     guidancesTotal,
          net:       guidancesNet
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
          net:           globalNet,
          totalContacts,
          // Répartition pour camembert (#29)
          breakdown: {
            preorders:     preordersTotal,
            donors:        donorsTotal,
            guidances:     guidancesTotal,
            subscriptions: subscriptionsTotal
          }
        },
        performance: {
          revenueToday:    revToday,    netRevenueToday:    netRevToday,
          revenue7d:       rev7d,       netRevenue7d:       netRev7d,
          revenue30d:      rev30d,      netRevenue30d:      netRev30d,
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

    // Format preorders : export complet des précommandes
    if (format === 'preorders') {
      const { data: orders, error } = await supabase
        .from('preorders')
        .select('created_at, email, full_name, offer, amount_total, paid_status, shipping_method, shipping_address, address_complement, postal_code, city, country, relay_name, relay_address1, relay_postal_code, relay_city, tracking_number, shipping_status')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = [
        'Date', 'Email', 'Nom', 'Offre', 'Montant (€)', 'Statut paiement',
        'Mode livraison', 'Adresse domicile', 'Point relais', 'Tracking', 'Statut expédition'
      ].map(esc).join(',');

      const rows = (orders || []).map(r => {
        const adresseDomicile = r.shipping_method === 'home'
          ? [r.shipping_address, r.address_complement, r.postal_code, r.city, r.country].filter(Boolean).join(', ')
          : '';
        const pointRelais = r.shipping_method === 'relay'
          ? [r.relay_name, r.relay_address1, r.relay_postal_code, r.relay_city].filter(Boolean).join(', ')
          : '';
        return [
          r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '',
          r.email, r.full_name, r.offer,
          r.amount_total != null ? parseFloat(r.amount_total).toFixed(2).replace('.', ',') : '',
          r.paid_status, r.shipping_method,
          adresseDomicile, pointRelais,
          r.tracking_number || '', r.shipping_status || ''
        ].map(esc).join(',');
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=precommandes-oradia.csv');
      return res.status(200).send('﻿' + header + '\n' + rows.join('\n'));
    }

    if (format === 'mondial-relay') {
      const { data: orders, error } = await supabase
        .from('preorders')
        .select('id, email, full_name, relay_id, relay_address1, relay_postal_code, relay_city, relay_country, shipping_status, created_at')
        .eq('shipping_method', 'relay')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

      // Colonnes dans l'ordre d'import Mondial Relay
      const header = ['Nom', 'Prénom', 'Adresse1', 'CodePostal', 'Ville', 'Pays',
        'NumeroPointRelais', 'Téléphone', 'Email', 'Poids', 'Reference'].map(esc).join(',');

      const rows = (orders || []).map(r => {
        const [firstName = '', ...lastParts] = (r.full_name || '').trim().split(' ');
        const lastName = lastParts.join(' ') || firstName;
        const firstNameOnly = lastParts.length > 0 ? firstName : '';
        return [
          lastName, firstNameOnly,
          r.relay_address1 || '',
          r.relay_postal_code || '',
          r.relay_city || '',
          r.relay_country || 'FR',
          r.relay_id || '',
          '',
          r.email,
          '800',
          r.id || ''
        ].map(esc).join(',');
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=mondial-relay-export.csv');
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

// ── COMMUNICATION (newsletter + emails promotionnels) ───────────────────

const PROMO_TYPE_LABELS = {
  lancement_precommande: 'Lancement de précommande',
  evenement: "Annonce d'événement",
  reduction: 'Réduction / code promo',
  offre_speciale: 'Offre spéciale',
  soldes: 'Soldes'
};

const NL_TON_LABELS = {
  contemplatif: 'contemplatif et incarné',
  poetique: 'poétique et sensoriel',
  scientifique: 'ancré et scientifique',
  narratif: 'narratif, sous forme de récit court'
};

// Faits concrets sur le produit, à disposition du modèle pour ancrer le texte
// dans le réel plutôt que dans des généralités marketing.
const PRODUIT_FACTS = [
  `Le Tore — La Boussole Intérieure : un oracle de 64 cartes (80x120mm), illustrations originales.`,
  `Le coffret physique contient : 64 cartes, un livret A5 de 200 pages avec un conte initiatique, une pièce de tirage, une boîte rigide.`,
  `Chaque tirage traverse 6 niveaux de lecture : émotion, besoin, transmutation, archétype, révélation, action.`,
  `L'oracle tourne aussi en ligne sur oradia.fr : 2 tirages gratuits, puis accès complet à 8€/mois (espace personnel + historique des tirages) ou tirages ponctuels à 3,90€.`,
  `Offres de lancement précommande : STANDARD à 38€ (coffret complet), ÉDITION SIGNATURE à 42€ — 100 exemplaires (coffret + dédicace personnalisée), GUIDANCE OFFERTE à 48€ (coffret + dédicace + séance de guidance en visio de 30 min).`
].join('\n');

function buildGeneratePrompt(body) {
  const { type, intention, source, ton, energie, idees_bonus, promo_type, promo_details, cta_text, cta_url } = body;

  const voiceRules = [
    `Tu écris au nom d'une personne réelle, la créatrice d'ORADIA (oracle de cartes "Le Tore"), pas au nom d'une marque ou d'une équipe.`,
    `Écris à la première personne du singulier ("je", "mon", "ma", "moi") — jamais "nous", "notre" ou "l'équipe Oradia".`,
    `Phrases courtes et directes. Vocabulaire simple, concret, parlé. Pas de tournures alambiquées, pas de jargon marketing, pas de superlatifs ("incroyable", "magique", "extraordinaire").`,
    `Évite absolument les formules génériques de newsletter de créateur·rice ("C'est le moment", "Après des mois de travail", "Je suis vraiment impatiente de te montrer", "ça me permet de financer l'impression", "n'hésite pas à m'écrire, je lis vraiment les messages"). Remplace les affirmations vagues ("c'est beau", "c'est pensé pour durer", "je suis contente du résultat") par des faits concrets et vérifiables sur le produit.`,
    `N'utilise jamais le tiret cadratin (—) dans le texte, y compris pour les listes. Pour une liste d'options ou de prix, utilise un retour à la ligne simple ou un tiret normal "-" suivi d'un espace.`,
    `Utilise les faits suivants sur le produit pour ancrer le texte (n'en cite que ceux qui sont pertinents pour ce message, ne les recopie pas tous mécaniquement) :\n${PRODUIT_FACTS}`,
    `Termine par une formule de signature simple à la première personne (ex : "À très vite,") sans nom de marque ni "L'équipe ORADIA" — laisse la place libre pour une signature personnelle.`
  ];

  if (type === 'promo') {
    return [
      ...voiceRules,
      `Rédige un email promotionnel pour : ${PROMO_TYPE_LABELS[promo_type] || promo_type || 'une communication spéciale'}.`,
      `Sujet / annonce : ${intention}`,
      promo_details ? `Détails à intégrer : ${promo_details}` : '',
      `Ton : sincère et incarné, mais surtout informatif et concret — explique ce qu'est le produit, ce qu'il contient, ce qui change, avant de chercher à créer de l'émotion.`,
      `Si l'annonce porte sur une offre ou un lancement avec plusieurs formules (ex : plusieurs prix ou options), présente-les de façon structurée et lisible (une ligne par option avec son prix et ce qu'elle inclut), pas fondues dans un paragraphe.`,
      `Le bouton d'action de l'email s'intitule : "${cta_text || 'Découvrir'}"${cta_url ? ` et pointe vers ${cta_url}` : ''}. Tu peux y faire référence dans le texte avec une phrase d'appel à l'action explicite juste avant.`,
      ``,
      `Réponds STRICTEMENT dans ce format, sans rien ajouter avant ou après :`,
      `OBJET: <objet de l'email, percutant et concret, sans emoji excessif>`,
      ``,
      `<corps de l'email en texte brut, sans markdown, sans tiret cadratin (—) ; autant de paragraphes et de lignes que nécessaire pour être clair, y compris des listes avec "-" si besoin>`
    ].filter(Boolean).join('\n');
  }

  return [
    ...voiceRules,
    `Rédige la newsletter hebdomadaire sur le thème : ${intention}.`,
    source === 'conte'
      ? `Inspire-toi d'un conte initiatique pour illustrer le propos.`
      : `Pars d'une observation du vivant (nature, saison, geste quotidien) pour illustrer le propos.`,
    `Ton : ${NL_TON_LABELS[ton] || NL_TON_LABELS.contemplatif}.`,
    energie ? `Énergie du moment à intégrer si pertinent : ${energie}.` : '',
    idees_bonus ? `Fragments du carnet à utiliser si pertinent :\n${idees_bonus}` : '',
    ``,
    `Réponds STRICTEMENT dans ce format, sans rien ajouter avant ou après :`,
    `OBJET: <objet de l'email>`,
    ``,
    `<corps de la newsletter en texte brut, 3 à 5 paragraphes courts, sans markdown>`
  ].filter(Boolean).join('\n');
}

function nlEscHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nlAbsUrl(path) {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : `https://oradia.fr${path.startsWith('/') ? '' : '/'}${path}`;
}

// Construit le HTML complet de l'email (newsletter ou promo) à partir d'un brouillon
function buildCommunicationEmailHtml(draft) {
  const subject = draft.subject || '';
  const content = draft.content || '';
  const intention = draft.intention || '';
  const images = draft.images || [];
  const extra = draft.extra || {};
  const isPromo = draft.type === 'promo';
  const ctaText = extra.cta_text || (isPromo ? "Découvrir l'offre" : "Découvrir l'Oracle Oradia");
  const ctaUrl = extra.cta_url || 'https://oradia.fr';

  const badgeHtml = isPromo && extra.badge
    ? `<p style="margin:0 0 14px;"><span style="display:inline-block; background:#d4af37; color:#0a192f; padding:6px 16px; border-radius:20px; font-size:12px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">${nlEscHtml(extra.badge)}</span></p>`
    : '';

  // Répartit les images sélectionnées dans le corps du texte (entre les paragraphes)
  // au lieu de les empiler en haut de l'email, pour aérer la lecture.
  const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const totalParas = paragraphs.length || 1;
  const totalImages = images.length;

  const imageRow = (img) => `
    <tr><td style="padding:0 32px 24px;">
      <img src="${nlAbsUrl(img.path)}" alt="${nlEscHtml(img.name || '')}" width="576" style="display:block; width:100%; max-width:576px; height:auto; border-radius:14px;">
    </td></tr>`;

  const hasPositions = images.length > 0 && images.every(img => img.position !== undefined && img.position !== null);
  let bodyRows = '';
  if (hasPositions) {
    const sorted = [...images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    paragraphs.forEach((para, i) => {
      sorted.filter(img => (img.position ?? 0) === i).forEach(img => { bodyRows += imageRow(img); });
      bodyRows += `<tr><td style="padding:0 32px 20px;">
      <div style="color:#c8c0a8; font-size:16px; line-height:1.8; font-family:Georgia,serif;">${nlEscHtml(para).replace(/\n/g, '<br>')}</div>
    </td></tr>`;
    });
    sorted.filter(img => (img.position ?? 0) >= paragraphs.length).forEach(img => { bodyRows += imageRow(img); });
  } else {
    let imgIdx = 0;
    paragraphs.forEach((para, i) => {
      while (imgIdx < totalImages && Math.floor((imgIdx + 1) * totalParas / (totalImages + 1)) === i) {
        bodyRows += imageRow(images[imgIdx++]);
      }
      bodyRows += `<tr><td style="padding:0 32px 20px;">
      <div style="color:#c8c0a8; font-size:16px; line-height:1.8; font-family:Georgia,serif;">${nlEscHtml(para).replace(/\n/g, '<br>')}</div>
    </td></tr>`;
    });
    while (imgIdx < totalImages) { bodyRows += imageRow(images[imgIdx++]); }
  }

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background-color:#040d1c;">
<table width="100%" cellpadding="0" cellspacing="0" background="https://oradia.fr/images/oradia-hero-4k.webp" bgcolor="#040d1c" style="background-image:url('https://oradia.fr/images/oradia-hero-4k.webp'); background-size:cover; background-position:center; background-repeat:no-repeat; background-color:#040d1c;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(10,25,47,0.95) 0%, rgba(5,20,40,0.96) 100%); max-width:640px; margin:0 auto; border-radius:16px; overflow:hidden; border:1px solid rgba(212,175,55,0.18); box-shadow:0 10px 40px rgba(0,0,0,0.4);">
  <tr><td background="https://oradia.fr/images/oradia-hero-4k.webp" bgcolor="#0a192f" style="background-image:url('https://oradia.fr/images/oradia-hero-4k.webp'); background-size:cover; background-position:center; background-repeat:no-repeat;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:50px 32px; text-align:center; background:linear-gradient(135deg, rgba(10,25,47,0.78) 0%, rgba(5,20,40,0.85) 100%);">
      <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
        <td style="vertical-align:middle; padding-right:8px;"><img src="https://oradia.fr/images/logo-hd-v2.webp" alt="O" width="34" height="34" style="display:block; height:34px; width:34px; border-radius:50%;"></td>
        <td style="vertical-align:middle;"><span style="color:#d4af37; font-family:Georgia,serif; font-size:30px; font-weight:700; letter-spacing:0.1em; line-height:34px;">RADIA</span></td>
      </tr></table>
      <p style="margin:10px 0 0; color:#f5e7a1; font-size:16px; font-style:italic; letter-spacing:0.1em;">La Boussole Intérieure</p>
      ${intention ? `<p style="margin:20px 0 0; color:#c8c0a8; font-size:14px; font-style:italic;">« ${nlEscHtml(intention)} »</p>` : ''}
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:30px 32px 0;">
    ${badgeHtml}
    ${subject ? `<h2 style="color:#d4af37; font-family:Georgia,serif; font-size:24px; margin:0 0 20px;">${nlEscHtml(subject)}</h2>` : ''}
  </td></tr>
  ${bodyRows}
  <tr><td style="padding:10px 32px 40px; text-align:center;">
    <a href="${nlAbsUrl(ctaUrl).replace(/"/g, '')}" style="display:inline-block; background:linear-gradient(135deg,#d4af37,#f5e7a1); color:#0a192f; text-decoration:none; padding:16px 40px; border-radius:50px; font-weight:700; font-size:16px; letter-spacing:0.05em;">${nlEscHtml(ctaText)}</a>
  </td></tr>
  <tr><td style="padding:30px 32px; border-top:1px solid rgba(212,175,55,0.2); text-align:center;">
    <p style="margin:0 0 10px; color:#f5e7a1; font-size:14px; opacity:0.8;">Avec gratitude,<br>Rudy Boucheron</p>
    <p style="margin:20px 0 0; color:#c8c0a8; font-size:12px; opacity:0.6;"><a href="https://oradia.fr" style="color:#d4af37; text-decoration:none;">oradia.fr</a></p>
    <p style="margin:15px 0 0; color:#c8c0a8; font-size:11px; opacity:0.5;">Vous recevez cet email car vous êtes abonné·e aux communications Oradia. <a href="{unsubscribe}" style="color:#c8c0a8;">Se désabonner</a></p>
  </td></tr>
</table>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

function nlSupabase() {
  return createClient(
    process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Traduit une réponse d'erreur Brevo en message clair (clé API / liste / plan)
async function brevoErrorMessage(r, context) {
  const rawText = await r.text();
  let code = null, brevoMsg = null;
  try {
    const parsed = JSON.parse(rawText);
    code = parsed.code || null;
    brevoMsg = parsed.message || null;
  } catch (_) { /* réponse non JSON */ }

  let diagnostic;
  if (r.status === 401 || code === 'unauthorized') {
    diagnostic = "Clé API Brevo invalide ou manquante. Vérifie la variable BREVO_API_KEY sur Vercel.";
  } else if (r.status === 403 || code === 'permission_denied' || code === 'not_enough_credits') {
    diagnostic = "Ton plan Brevo ne permet pas cette action (campagnes email ou crédits insuffisants). Vérifie ton plan dans Brevo → Paramètres → Plans et facturation.";
  } else if (r.status === 404 || code === 'not_found') {
    diagnostic = "Liste de contacts introuvable. Vérifie que la liste ID 5 existe bien dans Brevo → Contacts → Listes.";
  } else if (code === 'invalid_parameter' && /sender/i.test(brevoMsg || '')) {
    diagnostic = "L'adresse expéditrice contact@oradia.fr n'est pas un expéditeur vérifié dans Brevo. Vérifie-la dans Brevo → Expéditeurs.";
  } else {
    diagnostic = "Erreur inattendue de l'API Brevo.";
  }

  return `${context} : ${diagnostic}${brevoMsg ? ` (Brevo : ${brevoMsg})` : ''}`;
}

async function handleNewsletter(req, res) {
  try {
    verifyAdminAuth(req);

    const url = new URL(req.url, `http://${req.headers.host}`);
    const action = url.searchParams.get('action');
    const supabase = nlSupabase();

    if (req.method === 'GET') {
      if (action === 'unsent-count') {
        const { count: total } = await supabase.from('newsletter_contacts').select('*', { count: 'exact', head: true }).eq('status', 'active');
        const { count: unsent } = await supabase.from('newsletter_contacts').select('*', { count: 'exact', head: true }).eq('status', 'active').is('precommande_launch_sent_at', null);
        return res.status(200).json({ success: true, total: total || 0, unsent: unsent || 0, already_sent: (total || 0) - (unsent || 0) });
      }

      if (action === 'drafts') {
        const id = url.searchParams.get('id');
        if (id) {
          const { data, error } = await supabase
            .from('newsletter_drafts')
            .select('*')
            .eq('id', id)
            .maybeSingle();
          if (error) throw error;
          if (!data) return res.status(404).json({ error: 'Brouillon introuvable' });
          return res.status(200).json(data);
        }

        const { data: drafts, error } = await supabase
          .from('newsletter_drafts')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching drafts:', error);
          return res.status(500).json({ error: 'Erreur lors de la récupération des brouillons' });
        }

        return res.status(200).json(drafts || []);
      }

      if (action === 'ideas') {
        const { data, error } = await supabase
          .from('newsletter_ideas')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data || []);
      }

      return res.status(200).json({ success: true, newsletters: [] });
    }

    if (req.method === 'DELETE') {
      if (action === 'ideas') {
        const id = url.searchParams.get('id');
        if (!id) return res.status(400).json({ error: 'ID requis' });
        const { error } = await supabase.from('newsletter_ideas').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
      if (action === 'drafts') {
        const id = url.searchParams.get('id');
        if (!id) return res.status(400).json({ error: 'ID requis' });
        const { error } = await supabase.from('newsletter_drafts').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Action invalide' });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);

      // ── Génération IA (newsletter ou email promotionnel) ──
      if (action === 'generate') {
        if (!process.env.ANTHROPIC_API_KEY) {
          return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });
        }
        if (!body.intention || !body.intention.trim()) {
          return res.status(400).json({ error: "L'intention / le sujet est requis" });
        }

        const prompt = buildGeneratePrompt(body);
        const models = [process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5', 'claude-3-5-haiku-20241022'];
        let lastErr;

        for (const model of models) {
          try {
            const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({
                model,
                max_tokens: 1500,
                messages: [{ role: 'user', content: prompt }]
              }),
              signal: AbortSignal.timeout(30000)
            });

            if (!aiRes.ok) { lastErr = await aiRes.text(); continue; }
            const data = await aiRes.json();
            const content = (data.content || []).map(b => b.text || '').join('').trim();
            if (!content) { lastErr = 'Réponse vide du modèle'; continue; }
            return res.status(200).json({ success: true, content });
          } catch (e) {
            lastErr = e.message;
          }
        }

        return res.status(502).json({ error: 'Erreur lors de la génération IA', details: lastErr });
      }

      // ── Analyse des intentions de tirages (insights newsletter) ──
      if (action === 'analyze-intentions') {
        if (!process.env.ANTHROPIC_API_KEY) {
          return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });
        }
        const nlSupabase2 = createClient(
          process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const { data: tiragesWithIntent, error: tErr } = await nlSupabase2
          .from('tirages')
          .select('intention, cartes, created_at')
          .not('intention', 'is', null)
          .neq('intention', '')
          .order('created_at', { ascending: false })
          .limit(100);
        if (tErr) throw tErr;

        const { data: anonIntentions } = await nlSupabase2
          .from('intentions_anonymes')
          .select('intention, cartes, created_at')
          .not('intention', 'is', null)
          .neq('intention', '')
          .order('created_at', { ascending: false })
          .limit(100);

        const { data: allTirages } = await nlSupabase2
          .from('tirages')
          .select('cartes')
          .order('created_at', { ascending: false })
          .limit(200);
        const { data: allAnon } = await nlSupabase2
          .from('intentions_anonymes')
          .select('cartes')
          .order('created_at', { ascending: false })
          .limit(200);

        const carteCount = {};
        [...(allTirages || []), ...(allAnon || [])].forEach(t => {
          (t.cartes || []).forEach(c => { if (c) carteCount[c] = (carteCount[c] || 0) + 1; });
        });
        const topCartes = Object.entries(carteCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, nb]) => `${name.replace(/_/g, ' ')} (${nb}x)`);

        const intentions = [
          ...(tiragesWithIntent || []),
          ...(anonIntentions || [])
        ].map(t => t.intention.trim()).filter(Boolean);
        if (intentions.length === 0) {
          return res.status(200).json({ success: true, result: null, message: 'Aucune intention enregistrée' });
        }

        const prompt = `Tu es un assistant éditorial pour Oradia, un oracle de développement personnel basé sur le Tore.

Voici ${intentions.length} intentions posées par des utilisateurs lors de leurs tirages :

${intentions.map((i, n) => `${n + 1}. "${i}"`).join('\n')}

Cartes les plus tirées : ${topCartes.join(', ')}

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans blocs de code :
{"themes":[{"theme":"nom","pourcentage":30,"description":"explication courte"}],"besoins":["besoin 1","besoin 2","besoin 3"],"suggestions_newsletter":[{"sujet":"Titre newsletter","angle":"angle éditorial"},{"sujet":"...","angle":"..."},{"sujet":"...","angle":"..."}],"cartes_dominantes":${JSON.stringify(topCartes.slice(0, 5))}}

Contraintes : exactement 5 thèmes dont les pourcentages totalisent 100, exactement 3 besoins, exactement 3 suggestions_newsletter.`;

        const models = [process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5', 'claude-3-5-haiku-20241022'];
        let lastErr;
        for (const model of models) {
          try {
            const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
              signal: AbortSignal.timeout(30000)
            });
            if (!aiRes.ok) { lastErr = await aiRes.text(); continue; }
            const aiData = await aiRes.json();
            let raw = (aiData.content || []).map(b => b.text || '').join('').trim();
            // Retire les blocs markdown si présents
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            const result = JSON.parse(raw);
            try {
              const { logApiUsage } = require('../../lib/api-usage-tracker.js');
              await logApiUsage({
                apiName: 'analyze-intentions',
                modelName: model,
                requestTokens: aiData.usage?.input_tokens || 0,
                responseTokens: aiData.usage?.output_tokens || 0,
                status: 'success'
              });
            } catch (_) {}
            return res.status(200).json({ success: true, result, nb_intentions: intentions.length, analysed_at: new Date().toISOString() });
          } catch (e) { lastErr = e.message; }
        }
        return res.status(502).json({ error: 'Erreur analyse IA', details: lastErr });
      }

      // ── Sauvegarde d'un brouillon (newsletter ou promo) ──
      if (action === 'save') {
        const { id, subject, content, intention, type, images, extra } = body;

        const payload = {
          subject: subject || '',
          content: content || '',
          intention: intention || null,
          type: type === 'promo' ? 'promo' : 'newsletter',
          images: Array.isArray(images) ? images : [],
          extra: extra && typeof extra === 'object' ? extra : {},
          updated_at: new Date().toISOString()
        };

        if (id) {
          const { error } = await supabase
            .from('newsletter_drafts')
            .update(payload)
            .eq('id', id);
          if (error) {
            console.error('Error updating draft:', error);
            return res.status(500).json({ error: 'Erreur lors de la mise à jour du brouillon' });
          }
          return res.status(200).json({ success: true, message: 'Brouillon mis à jour', id });
        }

        const { data, error } = await supabase
          .from('newsletter_drafts')
          .insert({ ...payload, statut: 'brouillon', created_at: new Date().toISOString() })
          .select()
          .single();
        if (error) {
          console.error('Error creating draft:', error);
          return res.status(500).json({ error: 'Erreur lors de la création du brouillon' });
        }
        return res.status(200).json({ success: true, message: 'Brouillon créé', id: data.id });
      }

      // ── Ajout d'un fragment au carnet ──
      if (action === 'ideas') {
        const { content, source } = body;
        if (!content || !content.trim()) return res.status(400).json({ error: 'Contenu requis' });
        const { data, error } = await supabase
          .from('newsletter_ideas')
          .insert({ content: content.trim(), source: source || null })
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (action === 'delete') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'ID du brouillon requis' });
        const { error } = await supabase.from('newsletter_drafts').delete().eq('id', id);
        if (error) {
          console.error('Error deleting draft:', error);
          return res.status(500).json({ error: 'Erreur lors de la suppression du brouillon' });
        }
        return res.status(200).json({ success: true, message: 'Brouillon supprimé' });
      }

      // ── Envoi (email de test ou diffusion réelle via Brevo) ──
      if (action === 'schedule') {
        const { draft_id, scheduled_at, subject } = body;
        if (!draft_id || !scheduled_at) return res.status(400).json({ error: 'draft_id et scheduled_at requis' });
        const updates = { scheduled_at };
        if (subject && subject.trim()) updates.subject = subject.trim();
        const { error } = await supabase.from('newsletter_drafts').update(updates).eq('id', draft_id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (action === 'unschedule') {
        const { draft_id } = body;
        if (!draft_id) return res.status(400).json({ error: 'draft_id requis' });
        const { error } = await supabase.from('newsletter_drafts').update({ scheduled_at: null }).eq('id', draft_id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (action === 'send') {
        const { draft_id, test_email, subject, target_tags, exclude_already_sent } = body;
        if (!draft_id) return res.status(400).json({ error: 'draft_id requis' });

        const { data: draft, error: draftErr } = await supabase
          .from('newsletter_drafts')
          .select('*')
          .eq('id', draft_id)
          .maybeSingle();
        if (draftErr) throw draftErr;
        if (!draft) return res.status(404).json({ error: 'Brouillon introuvable' });

        const finalSubject = (subject && subject.trim()) || draft.subject || 'Oradia';
        const html = buildCommunicationEmailHtml({ ...draft, subject: finalSubject });

        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configurée' });

        if (test_email) {
          const r = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
            body: JSON.stringify({
              sender: { name: 'Oradia', email: 'contact@oradia.fr' },
              to: [{ email: test_email }],
              subject: '[TEST] ' + finalSubject,
              htmlContent: html.replace('{unsubscribe}', 'https://oradia.fr')
            })
          });
          if (!r.ok) {
            return res.status(502).json({ error: await brevoErrorMessage(r, "Erreur lors de l'envoi du test") });
          }
          return res.status(200).json({ success: true });
        }

        // Diffusion ciblée : envoi direct aux contacts portant une (ou plusieurs) catégorie(s),
        // sans passer par les listes Brevo (gestion des catégories uniquement via le dashboard).
        // exclude_already_sent force aussi ce chemin (même sans catégorie) pour permettre le
        // suivi par contact (precommande_launch_sent_at) — la campagne Brevo native ne le permet pas.
        if ((Array.isArray(target_tags) && target_tags.length > 0) || exclude_already_sent) {
          let contactsQuery = supabase.from('newsletter_contacts').select('email').eq('status', 'active');
          if (Array.isArray(target_tags) && target_tags.length > 0) contactsQuery = contactsQuery.overlaps('tags', target_tags);
          if (exclude_already_sent) contactsQuery = contactsQuery.is('precommande_launch_sent_at', null);
          const { data: contacts, error: contactsErr } = await contactsQuery;
          if (contactsErr) throw contactsErr;

          const emails = [...new Set((contacts || []).map(c => c.email).filter(Boolean))];
          if (emails.length === 0) {
            return res.status(400).json({ error: exclude_already_sent ? 'Tous les contacts actifs ont déjà reçu cet email.' : 'Aucun contact actif ne correspond à cette/ces catégorie(s)' });
          }

          const htmlWithUnsub = html.replace('{unsubscribe}', 'https://oradia.fr');
          // Envoi individuel par lots (un email par destinataire, pas de diffusion groupée
          // visible) pour rester dans le temps d'exécution de la fonction serverless.
          // On continue même en cas d'échecs isolés, mais on s'arrête si Brevo
          // signale un quota dépassé (402, plan gratuit = 300 emails/jour).
          const BATCH_SIZE = 10;
          let sent = 0;
          const sentEmails = [];
          const failedEmails = [];
          let quotaExceeded = false;

          for (let i = 0; i < emails.length; i += BATCH_SIZE) {
            if (quotaExceeded) {
              // Quota Brevo dépassé : le reste du lot n'a pas été envoyé, à relancer demain.
              failedEmails.push(...emails.slice(i));
              break;
            }

            const batch = emails.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(email => fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
              body: JSON.stringify({
                sender: { name: 'Oradia', email: 'contact@oradia.fr' },
                to: [{ email }],
                subject: finalSubject,
                htmlContent: htmlWithUnsub
              })
            })));

            results.forEach((r, idx) => {
              if (r.ok) {
                sent++;
                sentEmails.push(batch[idx]);
              } else {
                failedEmails.push(batch[idx]);
                if (r.status === 402) quotaExceeded = true;
              }
            });
          }

          const failed = failedEmails.length;

          if (exclude_already_sent && sentEmails.length > 0) {
            await supabase
              .from('newsletter_contacts')
              .update({ precommande_launch_sent_at: new Date().toISOString() })
              .in('email', sentEmails);
          }

          await supabase
            .from('newsletter_drafts')
            .update({
              statut: 'envoyé',
              sent_at: new Date().toISOString(),
              subject: finalSubject,
              sent_count: sent,
              failed_count: failed,
              failed_emails: failedEmails
            })
            .eq('id', draft_id);

          return res.status(200).json({
            success: true,
            recipients: emails.length,
            sent,
            failed,
            failedEmails,
            quotaExceeded
          });
        }

        // Diffusion réelle : campagne Brevo vers la liste newsletter (ID 5)
        const campRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
          body: JSON.stringify({
            name: `${draft.type === 'promo' ? 'Promo' : 'Newsletter'} — ${finalSubject} — ${new Date().toISOString()}`,
            subject: finalSubject,
            sender: { name: 'Oradia', email: 'contact@oradia.fr' },
            htmlContent: html,
            recipients: { listIds: [5] }
          })
        });
        if (!campRes.ok) {
          return res.status(502).json({ error: await brevoErrorMessage(campRes, "Erreur lors de la création de la campagne") });
        }
        const camp = await campRes.json();

        const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${camp.id}/sendNow`, {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY }
        });
        if (!sendRes.ok) {
          return res.status(502).json({ error: await brevoErrorMessage(sendRes, "Erreur lors du lancement de l'envoi") });
        }

        await supabase
          .from('newsletter_drafts')
          .update({ statut: 'envoyé', sent_at: new Date().toISOString(), subject: finalSubject })
          .eq('id', draft_id);

        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Action invalide' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Newsletter error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

// ── NEWSLETTER IMAGES ───────────────────────────────────────────────────
// Images "produit" : visuels Oradia déjà disponibles sur le site, réutilisables dans les communications
const NL_PRODUIT_IMAGES = [
  { file: 'Coffret.webp', name: 'Coffret Oradia' },
  { file: 'plateau.webp', name: 'Plateau du Tore' },
  { file: 'apercu-hd.webp', name: "Aperçu de l'oracle" },
  { file: 'oradia-hero-4k.webp', name: 'Visuel Oradia' },
  { file: 'coin-oradia.webp', name: 'Détail Oradia' }
];

// Images "Ma bibliothèque" : liste statique (mise à jour manuellement si de nouvelles images
// sont ajoutées dans images/newsletter/ambiance/). Volontairement codée en dur — un fs.readdir
// sur ce dossier ferait inclure tout le dossier /images (350+ Mo) dans la fonction serverless
// et dépasserait la limite de taille Vercel.
const NL_AMBIANCE_IMAGES = [
  { file: 'unsplash_hrerggbegny_accueillir_la_vuln_rabilit_.webp', name: 'Accueillir la vulnérabilité 1' },
  { file: 'unsplash_mgf7vfrbrei_accueillir_la_vuln_rabilit_.webp', name: 'Accueillir la vulnérabilité 2' }
];

// Petit dictionnaire FR → EN pour améliorer la pertinence des recherches Unsplash
// (l'API Unsplash répond beaucoup mieux à des mots-clés anglais).
const NL_FR_EN_DICT = {
  'lâcher-prise': 'letting go', 'lacher-prise': 'letting go', 'lâcher prise': 'letting go',
  'gratitude': 'gratitude', 'printemps': 'spring', 'été': 'summer', 'automne': 'autumn', 'hiver': 'winter',
  'lumière': 'light', 'lumiere': 'light', 'ombre': 'shadow', 'silence': 'silence', 'calme': 'calm',
  'océan': 'ocean', 'ocean': 'ocean', 'mer': 'sea', 'montagne': 'mountain', 'forêt': 'forest', 'foret': 'forest',
  'rivière': 'river', 'riviere': 'river', 'ciel': 'sky', 'étoiles': 'stars', 'etoiles': 'stars',
  'étoile': 'star', 'etoile': 'star', 'lune': 'moon', 'soleil': 'sun', 'racines': 'roots', 'racine': 'root',
  'ancrage': 'grounding', 'transformation': 'transformation', 'renaissance': 'rebirth',
  'intuition': 'intuition', 'sérénité': 'serenity', 'serenite': 'serenity', 'paix': 'peace',
  'amour': 'love', 'compassion': 'compassion', 'vulnérabilité': 'vulnerability', 'vulnerabilite': 'vulnerability',
  'courage': 'courage', 'confiance': 'trust', 'doute': 'doubt', 'peur': 'fear', 'joie': 'joy',
  'tristesse': 'sadness', 'colère': 'anger', 'colere': 'anger', 'patience': 'patience',
  'présence': 'presence', 'presence': 'presence', 'méditation': 'meditation', 'meditation': 'meditation',
  'respiration': 'breathing', 'équilibre': 'balance', 'equilibre': 'balance', 'mouvement': 'movement',
  'eau': 'water', 'terre': 'earth', 'feu': 'fire', 'air': 'air', 'vent': 'wind', 'pluie': 'rain',
  'nuit': 'night', 'jour': 'day', 'aube': 'dawn', 'crépuscule': 'dusk', 'crepuscule': 'dusk',
  'chemin': 'path', 'voyage': 'journey', 'porte': 'door', 'seuil': 'threshold', 'graine': 'seed',
  'fleur': 'flower', 'fleurs': 'flowers', 'arbre': 'tree', 'arbres': 'trees', 'feuille': 'leaf',
  'feuilles': 'leaves', 'vague': 'wave', 'vagues': 'waves', 'marée': 'tide', 'maree': 'tide',
  'brume': 'mist', 'neige': 'snow', 'glace': 'ice', 'sable': 'sand', 'désert': 'desert', 'desert': 'desert',
  'jardin': 'garden', 'nid': 'nest', 'cocon': 'cocoon', 'papillon': 'butterfly', 'oiseau': 'bird',
  'plume': 'feather', 'miroir': 'mirror', 'cercle': 'circle', 'spirale': 'spiral', 'cristal': 'crystal',
  'pierre': 'stone', 'pierres': 'stones', 'bois': 'wood', 'sentier': 'trail', 'horizon': 'horizon',
  'aurore': 'sunrise', 'coucher de soleil': 'sunset', 'nature': 'nature', 'guérison': 'healing',
  'guerison': 'healing', 'éveil': 'awakening', 'eveil': 'awakening', 'introspection': 'introspection',
  'simplicité': 'simplicity', 'simplicite': 'simplicity', 'douceur': 'softness', 'liberté': 'freedom',
  'liberte': 'freedom', 'espoir': 'hope', 'changement': 'change', 'cycle': 'cycle', 'saisons': 'seasons'
};

// Traduit grossièrement une intention/énergie en mots-clés anglais pour Unsplash.
// Garde les mots non reconnus tels quels (souvent des noms propres ou déjà en anglais).
function nlTranslateForUnsplash(text) {
  if (!text) return '';
  const normalized = text.toLowerCase()
    .replace(/[.,;:!?«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Essai sur les expressions à plusieurs mots d'abord
  let remaining = normalized;
  const found = [];
  for (const [fr, en] of Object.entries(NL_FR_EN_DICT)) {
    if (fr.includes(' ') || fr.includes('-')) {
      if (remaining.includes(fr)) {
        found.push(en);
        remaining = remaining.replace(fr, ' ');
      }
    }
  }

  for (const word of remaining.split(' ')) {
    if (!word) continue;
    if (NL_FR_EN_DICT[word]) found.push(NL_FR_EN_DICT[word]);
  }

  return found.length ? found.slice(0, 4).join(' ') : 'nature calm minimal';
}

async function handleNewsletterImages(req, res) {
  try {
    verifyAdminAuth(req);

    if (req.method === 'GET') {
      return res.status(200).json({ success: true, images: [] });
    }

    if (req.method === 'POST') {
      const body = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', c => d += c);
        req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
        req.on('error', reject);
      });

      // Action "save" : utilisée pour les images Unsplash, pas de persistance possible
      // sur Vercel (filesystem en lecture seule) — on renvoie l'URL d'origine telle quelle.
      if (body.action === 'save') {
        return res.status(200).json({ success: false });
      }

      // 1. Images produit (assets statiques du site)
      const produit = NL_PRODUIT_IMAGES
        .map(img => ({ path: `/images/${img.file}`, name: img.name, source: 'local', category: 'produit' }));

      // 2. Ma bibliothèque (images déjà collectées pour les newsletters + illustrations du Tore)
      const ambiance_locale = NL_AMBIANCE_IMAGES
        .map(img => ({ path: `/images/newsletter/ambiance/${img.file}`, name: img.name, source: 'local', category: 'ambiance' }))
        .concat(NL_LIBRARY_IMAGES.map(img => ({ path: img.path, name: img.name, source: 'local', category: img.category || 'bibliotheque' })));

      // 3. Unsplash (uniquement si une clé API est configurée)
      let unsplash = [];
      const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
      if (UNSPLASH_KEY) {
        try {
          const rawQuery = body.theme_keywords || body.intention || 'contemplation';
          const query = nlTranslateForUnsplash(rawQuery);
          const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape&content_filter=high`, {
            headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` }
          });
          if (r.ok) {
            const data = await r.json();
            unsplash = (data.results || []).map(photo => ({
              path: photo.urls.regular,
              thumb: photo.urls.small,
              name: photo.alt_description || 'Photo Unsplash',
              source: 'unsplash',
              category: 'unsplash',
              download_url: photo.links.download_location,
              filename: `unsplash_${photo.id}.jpg`
            }));
          }
        } catch (e) {
          console.error('Erreur Unsplash:', e.message);
        }
      }

      return res.status(200).json({ success: true, produit, ambiance_locale, unsplash });
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
      .select('id, email, created_at, tags')
      .eq('brevo_synced', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Sync vers Brevo : seuls les contacts "general" (ou sans tags = anciennes
    // inscriptions) sont ajoutés à la liste 5. Les autres catégories sont
    // marquées synchronisées sans toucher à la liste Brevo.
    let synced = 0;
    let errors = 0;
    for (const contact of contacts) {
      const isGeneral = !contact.tags || contact.tags.length === 0 || contact.tags.includes('general');
      try {
        if (isGeneral) {
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
          if (!(response.ok || response.status === 409)) {
            errors++;
            continue;
          }
        }

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
          errors++;
          console.error('Failed to update brevo_synced for', contact.email, updateError.message);
        }
      } catch (e) {
        errors++;
        console.error('Brevo sync error for', contact.email, e.message);
      }
    }

    return res.status(200).json({
      success: true,
      synced,
      errors,
      already: 0,
      message: `${synced} contacts synchronisés avec Brevo`,
      total: contacts.length
    });
  } catch (error) {
    console.error('Sync Brevo error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}

// ── Sync des désinscriptions : interroge Brevo pour chaque abonné actif ──
// et met à jour Supabase si le contact s'est désabonné ou est blacklisté.
async function handleSyncBrevoUnsubscribes(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
  try {
    verifyAdminAuth(req);

    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) return res.status(500).json({ error: 'Clé Brevo manquante' });

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Récupère les abonnés actifs (ceux qu'on croit inscrits dans Brevo)
    const { data: subscribers, error } = await supabase
      .from('newsletter_contacts')
      .select('id, email')
      .eq('brevo_synced', true)
      .neq('status', 'unsubscribed')
      .limit(100);

    if (error) throw error;
    if (!subscribers || subscribers.length === 0) {
      return res.status(200).json({ success: true, checked: 0, unsubscribed: 0, message: 'Aucun abonné actif à vérifier' });
    }

    let unsubscribedCount = 0;
    const now = new Date().toISOString();

    for (const contact of subscribers) {
      try {
        const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(contact.email)}`, {
          headers: { 'api-key': BREVO_API_KEY, 'Accept': 'application/json' }
        });
        if (!r.ok) continue; // contact introuvable dans Brevo = on ne touche pas

        const brevoContact = await r.json();
        // emailBlacklisted = true : le contact a cliqué "se désabonner" dans une campagne Brevo
        // listUnsubscribed : liste des listes dont il s'est désabonné (complément)
        const listId = parseInt(process.env.BREVO_WAITLIST_LIST_ID || '5', 10);
        const unsubLists = Array.isArray(brevoContact.listUnsubscribed) ? brevoContact.listUnsubscribed : [];
        const isUnsubscribed = brevoContact.emailBlacklisted === true
          || unsubLists.some(id => String(id) === String(listId));

        if (isUnsubscribed) {
          const updatePayload = { status: 'unsubscribed', brevo_synced: false };
          try { updatePayload.unsubscribed_at = now; } catch (_) {}
          await supabase.from('newsletter_contacts').update(updatePayload).eq('id', contact.id);
          unsubscribedCount++;
        }
      } catch (e) {
        console.warn('[sync-unsubscribes] erreur pour', contact.email, e.message);
      }
    }

    return res.status(200).json({
      success: true,
      checked: subscribers.length,
      unsubscribed: unsubscribedCount,
      message: `${subscribers.length} abonnés vérifiés, ${unsubscribedCount} désabonnement(s) détecté(s)`
    });
  } catch (error) {
    console.error('handleSyncBrevoUnsubscribes error:', error);
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

    if (path === '/sync-brevo-unsubscribes' || path === '/sync-brevo-unsubscribes/') {
      return await handleSyncBrevoUnsubscribes(req, res);
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

    // ── Guidances par visio ──
    if (path === '/guidances' || path === '/guidances/') {
      verifyAdminAuth(req);
      const sb = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      if (req.method === 'GET') {
        const page = parseInt(urlParams.get('page') || '1', 10);
        const statusFilter = urlParams.get('status') || '';
        const limit = 20;
        const offset = (page - 1) * limit;
        let query = sb.from('guidances')
          .select('*', { count: 'exact' })
          .order('scheduled_at', { ascending: false })
          .range(offset, offset + limit - 1);
        const idFilter = urlParams.get('id');
        if (idFilter) query = query.eq('id', idFilter);
        if (statusFilter) query = query.eq('status', statusFilter);
        const { data, error, count } = await query;
        if (error) throw error;
        return res.status(200).json({ success: true, data: data || [], total: count || 0, page });
      }

      if (req.method === 'POST') {
        const body = await parseBody(req);
        const { id, status, notes } = body;
        if (!id) return res.status(400).json({ error: 'id requis' });
        const updates = {};
        if (status !== undefined) updates.status = status;
        if (notes !== undefined) updates.notes = notes;
        const { error } = await sb.from('guidances').update(updates).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      return res.status(405).end();
    }

    // ── Tracking de pages vues (route publique, appelée par js/page-tracker.js) ──
    if (path === '/track' || path === '/track/') {
      if (req.method !== 'POST') return res.status(405).end();
      try {
        const body = await parseBody(req);
        const pagePath = String(body.path || '').slice(0, 300);
        const referrer = String(body.referrer || '').slice(0, 500);
        const sessionId = String(body.session_id || '').slice(0, 100);
        if (!pagePath || !sessionId) return res.status(204).end();
        const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
        await sb.from('page_views').insert({ path: pagePath, referrer: referrer || null, session_id: sessionId });
      } catch (_) { /* le tracking ne doit jamais faire échouer la requête côté visiteur */ }
      return res.status(204).end();
    }

    if (path === '/system-logs' || path === '/system-logs/') {
      verifyAdminAuth(req);
      const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
      if (req.method === 'GET') {
        const level = urlParams.get('level') || '';
        const limit = Math.min(parseInt(urlParams.get('limit') || '200', 10), 500);
        const since = urlParams.get('since') || '';
        let q = sb.from('system_logs').select('*').order('created_at', { ascending: false }).limit(limit);
        if (level) q = q.eq('level', level);
        if (since) q = q.gte('created_at', since);
        const { data, error, count } = await q;
        if (error) throw error;
        return res.status(200).json({ success: true, data: data || [], total: count });
      }
      if (req.method === 'DELETE') {
        const { error } = await sb.from('system_logs').delete().lt('created_at', new Date(Date.now() - 86400000).toISOString());
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
      return res.status(405).end();
    }

    if (path === '/transactions' || path === '/transactions/') {
      verifyAdminAuth(req);
      const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
      if (req.method === 'GET') {
        const year = urlParams.get('year') || new Date().getFullYear().toString();
        const month = urlParams.get('month') || '';
        const type = urlParams.get('type') || '';
        const dateFrom = month ? `${year}-${month.padStart(2,'0')}-01` : `${year}-01-01`;
        const dateTo = month
          ? new Date(parseInt(year,10), parseInt(month,10), 0).toISOString().slice(0,10)
          : `${year}-12-31`;
        let q = sb.from('transactions').select('*').gte('date', dateFrom).lte('date', dateTo).order('date', { ascending: false });
        if (type) q = q.eq('type', type);
        const { data, error } = await q;
        if (error) throw error;
        const recetteRows = (data || []).filter(t => t.type === 'recette');
        const recettes = recetteRows.reduce((s, t) => s + parseFloat(t.amount), 0);
        const depenses = (data || []).filter(t => t.type === 'depense').reduce((s, t) => s + parseFloat(t.amount), 0);

        // Distinction fiscale micro-entrepreneur : vente de marchandises (BIC, 12,3%)
        // vs prestations de services (BNC, 21,1%) — taux 2026
        const recettesVentesBIC = recetteRows
          .filter(t => t.source === 'precommande' || t.source === 'abonnement')
          .reduce((s, t) => s + parseFloat(t.amount), 0);
        const recettesServicesBNC = recettes - recettesVentesBIC;
        const URSSAF_RATE_BIC = 0.123;
        const URSSAF_RATE_BNC = 0.211;
        const urssafBIC = recettesVentesBIC * URSSAF_RATE_BIC;
        const urssafBNC = recettesServicesBNC * URSSAF_RATE_BNC;
        const urssaf = urssafBIC + urssafBNC;

        // Estimation des frais Stripe (1,4% + 0,25€/transaction), à titre informatif uniquement —
        // n'affecte jamais le calcul URSSAF (qui se base sur le montant brut encaissé, conformément
        // au régime micro-entrepreneur). Ne s'applique qu'aux recettes encaissées via Stripe.
        const STRIPE_SOURCES = ['precommande', 'abonnement', 'don', 'guidance'];
        const stripeRows = recetteRows.filter(t => STRIPE_SOURCES.includes(t.source));
        const stripeFeesEstimate = stripeRows.reduce((s, t) => s + parseFloat(t.amount) * 0.014 + 0.25, 0);
        const tresorerieReelleEstimee = recettes - stripeFeesEstimate - depenses;

        return res.status(200).json({
          success: true,
          data: data || [],
          summary: {
            recettes, depenses, net: recettes - depenses, urssaf,
            stripeFeesEstimate, tresorerieReelleEstimee,
            breakdown: {
              recettesVentesBIC, recettesServicesBNC,
              urssafBIC, urssafBNC,
              tauxBIC: URSSAF_RATE_BIC, tauxBNC: URSSAF_RATE_BNC
            }
          }
        });
      }
      if (req.method === 'POST') {
        const body = await parseBody(req);
        if (body.id) {
          const { id, ...updates } = body;
          const { error } = await sb.from('transactions').update(updates).eq('id', id);
          if (error) throw error;
          return res.status(200).json({ success: true });
        }
        const { error, data } = await sb.from('transactions').insert(body).select().single();
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }
      if (req.method === 'DELETE') {
        const id = urlParams.get('id');
        if (!id) return res.status(400).json({ error: 'id requis' });
        const { error } = await sb.from('transactions').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
      return res.status(405).end();
    }

    if (path === '/analytics' || path === '/analytics/') {
      verifyAdminAuth(req);
      const range = urlParams.get('range') || '7d';
      const days = range === '365d' ? 365 : range === '30d' ? 30 : range === '7d' ? 7 : 1;
      const now = Date.now();
      const since = new Date(now - days * 86400000).toISOString();
      const prevSince = new Date(now - days * 2 * 86400000).toISOString();
      const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

      const computeTraffic = (rows) => {
        const v = rows || [];
        const uniqueSessions = new Set(v.map(r => r.session_id)).size;
        const pageCounts = {};
        v.forEach(r => { if (r.path) pageCounts[r.path] = (pageCounts[r.path] || 0) + 1; });
        const topPages = Object.entries(pageCounts).sort((a,b) => b[1]-a[1]).slice(0,10).map(([path,count]) => ({path,count}));
        const SELF_REFERRERS = new Set(['oradia.fr', 'www.oradia.fr', 'oradia-site.vercel.app']);
        const referrerCounts = {};
        v.forEach(r => {
          let ref = 'Direct / inconnu';
          if (r.referrer) { try { ref = new URL(r.referrer).hostname.replace(/^www\./,''); } catch(_) { ref = 'Direct / inconnu'; } }
          if (SELF_REFERRERS.has(ref)) return; // exclure les visites depuis le site lui-même
          referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
        });
        const topReferrers = Object.entries(referrerCounts).sort((a,b) => b[1]-a[1]).slice(0,8).map(([referrer,count]) => ({referrer,count}));
        const byDay = {};
        v.forEach(r => { const d = r.created_at.slice(0,10); byDay[d] = (byDay[d] || 0) + 1; });
        const dailyViews = Object.entries(byDay).sort((a,b) => a[0]<b[0]?-1:1).map(([date,count]) => ({date,count}));
        const sessionPageCount = {};
        v.forEach(r => { sessionPageCount[r.session_id] = (sessionPageCount[r.session_id] || 0) + 1; });
        const singlePageSessions = Object.values(sessionPageCount).filter(n => n === 1).length;
        const bounceRate = uniqueSessions > 0 ? (singlePageSessions / uniqueSessions * 100) : null;
        const pagesPerVisit = uniqueSessions > 0 ? (v.length / uniqueSessions) : null;
        return { total_views: v.length, unique_visitors: uniqueSessions, top_pages: topPages, top_referrers: topReferrers, daily_views: dailyViews, bounce_rate: bounceRate, pages_per_visit: pagesPerVisit };
      };

      // ── Trafic réel (pages vues du site, via js/page-tracker.js) ──
      const { data: views } = await sb.from('page_views').select('created_at,path,referrer,session_id').gte('created_at', since).not('path', 'like', '/admin%').order('created_at', { ascending: false }).limit(20000);
      const { data: prevViews } = await sb.from('page_views').select('created_at,session_id').gte('created_at', prevSince).lt('created_at', since).not('path', 'like', '/admin%').limit(20000);
      const traffic = computeTraffic(views);
      const prevTraffic = computeTraffic(prevViews);
      const pctChange = (curr, prev) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0));
      traffic.views_change_pct = pctChange(traffic.total_views, prevTraffic.total_views);
      traffic.visitors_change_pct = pctChange(traffic.unique_visitors, prevTraffic.unique_visitors);

      // ── Santé technique (erreurs API, depuis system_logs) ──
      const { data: logs } = await sb.from('system_logs').select('level').gte('created_at', since);
      const errors = (logs || []).filter(l => l.level === 'error').length;
      const warnings = (logs || []).filter(l => l.level === 'warning').length;

      if (req.method === 'POST') {
        if (!process.env.ANTHROPIC_API_KEY) {
          return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });
        }
        const prompt = `Tu es consultant en growth marketing pour Oradia, un site français d'oracle/guidance spirituelle (vente d'un oracle physique en précommande, abonnement "Tore" pour tirages en ligne à 8€/mois, guidances individuelles par visio, dons libres).

Voici les statistiques de trafic réelles des ${days} derniers jours (comparées à la période précédente de même durée) :
- Pages vues : ${traffic.total_views} (${traffic.views_change_pct >= 0 ? '+' : ''}${traffic.views_change_pct}% vs période précédente)
- Visiteurs uniques : ${traffic.unique_visitors} (${traffic.visitors_change_pct >= 0 ? '+' : ''}${traffic.visitors_change_pct}%)
- Pages vues par visite : ${traffic.pages_per_visit != null ? traffic.pages_per_visit.toFixed(2) : 'N/A'}
- Taux de rebond (visite d'une seule page) : ${traffic.bounce_rate != null ? traffic.bounce_rate.toFixed(0) + '%' : 'N/A'}
- Pages les plus consultées : ${traffic.top_pages.map(p => `${p.path} (${p.count})`).join(', ') || 'aucune donnée'}
- Provenance des visiteurs : ${traffic.top_referrers.map(r => `${r.referrer} (${r.count})`).join(', ') || 'aucune donnée'}
- Erreurs techniques sur la période : ${errors}

Analyse ces chiffres et donne-moi, en français, de façon concise et actionnable (utilise des puces, pas de blabla) :
1. Ce qui va bien
2. Ce qui est préoccupant ou à surveiller
3. 3 à 5 actions concrètes et priorisées pour améliorer le trafic et la conversion du site, en tenant compte du contexte (petit site indépendant, trafic encore faible, donc ne suggère pas d'analyses nécessitant un grand volume de données)

Sois honnête si les données sont trop limitées pour conclure quoi que ce soit de fiable — dans ce cas dis-le clairement plutôt que d'inventer des tendances.`;

        const models = [process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5', 'claude-3-5-haiku-20241022'];
        let lastErr;
        for (const model of models) {
          try {
            const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
              signal: AbortSignal.timeout(30000)
            });
            if (!aiRes.ok) { lastErr = await aiRes.text(); continue; }
            const data = await aiRes.json();
            const content = (data.content || []).map(b => b.text || '').join('').trim();
            if (!content) { lastErr = 'Réponse vide du modèle'; continue; }
            return res.status(200).json({ success: true, analysis: content });
          } catch (e) { lastErr = e.message; }
        }
        return res.status(502).json({ error: 'Erreur lors de l\'analyse IA', details: lastErr });
      }

      if (req.method !== 'GET') return res.status(405).end();
      return res.status(200).json({
        success: true,
        range,
        traffic,
        logs_stats: { errors, warnings, total: (logs||[]).length }
      });
    }

    // ── Sauvegarde d'une intention anonyme (visiteur sans compte) ──
    if (path === '/intentions' || path === '/intentions/') {
      if (req.method !== 'POST') return res.status(405).end();
      const body = await parseBody(req);
      const intention = (body.intention || '').trim();
      if (!intention) return res.status(400).json({ error: 'intention requise' });
      const sb = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { error: iErr } = await sb.from('intentions_anonymes').insert({
        intention,
        cartes: body.cartes || null
      });
      if (iErr) { console.error('[intentions_anonymes]', iErr); return res.status(500).json({ error: 'Erreur sauvegarde' }); }
      return res.status(200).json({ success: true });
    }

    // ── Webhook Brevo : synchronisation des désinscriptions newsletter ──
    // Brevo appelle ce endpoint quand un contact se désinscrit d'une campagne email.
    // URL à configurer dans Brevo > Paramètres > Webhooks : /api/admin/brevo-webhook?key=BREVO_WEBHOOK_SECRET
    if (path === '/brevo-webhook' || path === '/brevo-webhook/') {
      // Vérification du secret partagé (clé dans query param)
      const webhookKey = urlParams.get('key') || req.query?.key;
      const expectedKey = process.env.BREVO_WEBHOOK_SECRET;
      if (expectedKey && webhookKey !== expectedKey) {
        console.warn('[brevo-webhook] Clé invalide reçue');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (req.method !== 'POST') return res.status(405).end();

      const body = await parseBody(req);
      // Brevo envoie : { event: 'unsubscribed'|'hardBounced'|'softBounced'|..., email: '...' }
      const event = body.event || '';
      const email = (body.email || '').trim().toLowerCase();

      if (!email) return res.status(400).json({ error: 'email manquant' });

      const sb = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      if (event === 'unsubscribed' || event === 'hardBounced') {
        const updates = {
          status: 'unsubscribed',
          brevo_synced: false,
          unsubscribed_at: new Date().toISOString()
        };
        const { error } = await sb.from('newsletter_contacts').update(updates).eq('email', email);
        if (error) {
          console.error('[brevo-webhook] update error:', error.message);
          return res.status(500).json({ error: 'db error' });
        }
        console.log(`[brevo-webhook] ${event} pour ${email}`);
        return res.status(200).json({ success: true, event, email });
      }

      // Événement non géré — on répond 200 pour que Brevo ne retry pas
      return res.status(200).json({ success: true, ignored: event });
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
    try {
        const logSb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
        await logSb.from('system_logs').insert({ level: 'error', source: 'api/admin', path: req.url, method: req.method, status_code: error.statusCode || 500, message: error.message, details: { stack: error.stack?.slice(0,300) } });
    } catch (_) {}
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
 * Interroge le suivi détaillé Mondial Relay (WSI2_TracingColisDetaille_Liste)
 * pour un lot de numéros d'expédition, et renvoie ceux qui sont marqués livrés.
 * Security = MD5(Enseigne + Expedition + Langue + ClePrivee).toUpperCase()
 */
async function trackMondialRelayShipments(trackingNumbers) {
  const expedition = trackingNumbers.join(';');
  const langue = 'FR';
  const securityString = MONDIAL_RELAY_ENSEIGNE + expedition + langue + MONDIAL_RELAY_PRIVATE_KEY;
  const security = crypto.createHash('md5').update(securityString, 'utf8').digest('hex').toUpperCase();

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetaille_Liste xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${MONDIAL_RELAY_ENSEIGNE}</Enseigne>
      <Expedition>${expedition}</Expedition>
      <Langue>${langue}</Langue>
      <Security>${security}</Security>
    </WSI2_TracingColisDetaille_Liste>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(MONDIAL_RELAY_API1_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.mondialrelay.fr/webservice/WSI2_TracingColisDetaille_Liste',
      'MessageType': 'CALL'
    },
    body: soapBody
  });

  if (!response.ok) {
    throw new Error(`API Mondial Relay (tracing) HTTP error: ${response.status} ${response.statusText}`);
  }

  const xmlResponse = await response.text();
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, mergeAttrs: true });
  const parsedData = await parser.parseStringPromise(xmlResponse);

  const result =
    parsedData?.['soap:Envelope']?.['soap:Body']?.WSI2_TracingColisDetaille_ListeResponse?.WSI2_TracingColisDetaille_ListeResult
    || parsedData?.['soap12:Envelope']?.['soap12:Body']?.WSI2_TracingColisDetaille_ListeResponse?.WSI2_TracingColisDetaille_ListeResult
    || parsedData?.soap?.Envelope?.Body?.WSI2_TracingColisDetaille_ListeResponse?.WSI2_TracingColisDetaille_ListeResult;

  if (!result) {
    throw new Error('No WSI2_TracingColisDetaille_ListeResult node found');
  }

  const expeditionsRaw = result?.Tracing_Detaille_Result?.Expedition;
  const expeditions = !expeditionsRaw ? [] : (Array.isArray(expeditionsRaw) ? expeditionsRaw : [expeditionsRaw]);

  // Un colis est considéré "livré" si l'un de ses événements de suivi contient
  // un libellé évoquant la livraison (la doc Mondial Relay liste plusieurs
  // libellés français possibles selon le type de livraison).
  const delivered = new Set();
  for (const exp of expeditions) {
    const num = exp?.NumeroExpedition || exp?.Numero;
    if (!num) continue;
    const tracesRaw = exp?.Traces?.Trace;
    const traces = !tracesRaw ? [] : (Array.isArray(tracesRaw) ? tracesRaw : [tracesRaw]);
    const isDelivered = traces.some(t => /livr/i.test(t?.Libelle || ''));
    if (isDelivered) delivered.add(String(num));
  }

  return delivered;
}

/**
 * Vérifie les commandes "expédiées" et marque automatiquement comme "livrées"
 * celles dont le suivi Mondial Relay indique une livraison effectuée.
 * Appelé quotidiennement par GitHub Actions (secret CRON_SECRET).
 */
async function checkMondialRelayDeliveries(supabase, res) {
  if (!MONDIAL_RELAY_ENSEIGNE || !MONDIAL_RELAY_PRIVATE_KEY) {
    return res.status(200).json({ success: true, checked: 0, delivered: 0, message: 'Mondial Relay non configuré' });
  }

  const { data: shipped, error } = await supabase
    .from('preorders')
    .select('id, tracking_number')
    .eq('shipping_status', 'shipped')
    .not('tracking_number', 'is', null);
  if (error) throw error;

  if (!shipped || shipped.length === 0) {
    return res.status(200).json({ success: true, checked: 0, delivered: 0 });
  }

  const trackingNumbers = shipped.map(o => o.tracking_number).filter(Boolean);

  let deliveredSet;
  try {
    deliveredSet = await trackMondialRelayShipments(trackingNumbers);
  } catch (e) {
    console.error('[Cron] Erreur suivi Mondial Relay:', e.message);
    return res.status(200).json({ success: false, checked: trackingNumbers.length, delivered: 0, error: e.message });
  }

  let deliveredCount = 0;
  for (const order of shipped) {
    if (deliveredSet.has(String(order.tracking_number))) {
      const { error: updateError } = await supabase
        .from('preorders')
        .update({ shipping_status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', order.id);
      if (!updateError) deliveredCount++;
    }
  }

  return res.status(200).json({ success: true, checked: trackingNumbers.length, delivered: deliveredCount });
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

async function handleCronRelance(supabase, res) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    return res.status(200).json({ success: false, message: 'BREVO_API_KEY non configuré' });
  }

  const now = new Date();
  const dateOffset = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };

  const results = { j1: 0, j4: 0, j10: 0, errors: [] };

  const relances = [
    { field: 'relance_j1_sent',  sentAt: 'relance_j1_sent_at',  days: 1,  templateEnv: 'BREVO_TEMPLATE_J1' },
    { field: 'relance_j4_sent',  sentAt: 'relance_j4_sent_at',  days: 4,  templateEnv: 'BREVO_TEMPLATE_J4' },
    { field: 'relance_j10_sent', sentAt: 'relance_j10_sent_at', days: 10, templateEnv: 'BREVO_TEMPLATE_J10' },
  ];

  for (const { field, sentAt, days, templateEnv } of relances) {
    const templateId = parseInt(process.env[templateEnv] || '0', 10);
    if (!templateId) continue;

    const targetDate = dateOffset(days);

    const { data: contacts, error } = await supabase
      .from('tore_emails')
      .select('id, email')
      .eq(field, false)
      .eq('unsubscribed', false)
      .gte('created_at', `${targetDate}T00:00:00.000Z`)
      .lt('created_at', `${targetDate}T23:59:59.999Z`);

    if (error) {
      console.error(`[cron-relance] Erreur lecture tore_emails (${field}):`, error.message);
      results.errors.push(`${field}: ${error.message}`);
      continue;
    }

    for (const contact of (contacts || [])) {
      try {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            to: [{ email: contact.email }]
          })
        });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`Brevo ${r.status}: ${txt}`);
        }
        await supabase.from('tore_emails').update({
          [field]: true,
          [sentAt]: now.toISOString()
        }).eq('id', contact.id);
        results[`j${days}`]++;
      } catch (e) {
        console.error(`[cron-relance] Erreur envoi à ${contact.email}:`, e.message);
        results.errors.push(`${contact.email}: ${e.message}`);
      }
    }
  }

  console.log('[cron-relance] Résultat:', results);
  return res.status(200).json({ success: true, ...results });
}
