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

// Génère un token HMAC pour les liens de désinscription — stateless, pas de BDD nécessaire
function generateUnsubToken(email) {
  const secret = process.env.ADMIN_SESSION_SECRET || 'oradia-fallback-secret';
  return crypto.createHmac('sha256', secret).update(email.toLowerCase().trim()).digest('hex').slice(0, 32);
}

function buildUnsubUrl(email) {
  const token = generateUnsubToken(email);
  return `https://oradia.fr/unsubscribe.html?email=${encodeURIComponent(email)}&token=${token}`;
}

// Convertit un tableau d'objets en CSV (échappement basique des guillemets/virgules)
function rowsToCsv(rows) {
  if (!rows || rows.length === 0) return '';
  // "sep=," indique le séparateur à Excel (sinon, en français, il attend
  // des points-virgules et affiche tout dans une seule colonne)
  const columns = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = ['sep=,', columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map(c => escape(row[c])).join(','));
  }
  // BOM UTF-8 pour qu'Excel affiche correctement les accents
  return '﻿' + lines.join('\r\n');
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
    // Les tâches automatiques (Vercel Cron, GitHub Actions, et les services externes
    // comme cron-job.org pour les fréquences que le plan Vercel Hobby ne permet pas)
    // s'authentifient via un secret partagé plutôt qu'une session admin. Le secret peut
    // arriver par header (x-cron-secret, Authorization Bearer) ou en paramètre d'URL
    // (?cron_secret=) — ce dernier reste nécessaire pour cron-job.org, qui ne permet
    // pas d'envoyer un header personnalisé sur ses jobs existants.
    const cronSecret    = req.headers['x-cron-secret'];
    const authHeader    = req.headers['authorization'] || '';
    const bearerToken   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const cronQs        = req.query?.cron_secret;
    const vercelCronSig = req.headers['x-vercel-cron-signature'];
    const vercelCron    = req.headers['x-vercel-cron'];
    const isCronRequest =
      (!!process.env.CRON_SECRET && cronSecret  === process.env.CRON_SECRET) ||
      (!!process.env.CRON_SECRET && bearerToken === process.env.CRON_SECRET) ||
      (!!process.env.CRON_SECRET && cronQs      === process.env.CRON_SECRET) ||
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
      if (getAction === 'cron-send-scheduled') {
        try {
          // ── Newsletters programmées ──
          // Ce bloc est indépendant du bloc « publications sociales » plus bas :
          // il ne doit JAMAIS provoquer de return prématuré, sinon un post social
          // programmé sans newsletter due au même moment ne partirait jamais.
          const results = [];
          if (await isFeatureEnabled(supabase, 'newsletter_scheduled_send')) {
            const { data: due } = await supabase
              .from('newsletter_drafts')
              .select('*')
              .neq('statut', 'envoyé')
              .not('scheduled_at', 'is', null)
              .lte('scheduled_at', new Date().toISOString())
              .limit(5);
            const BREVO_API_KEY = process.env.BREVO_API_KEY;
            if ((due && due.length > 0) && !BREVO_API_KEY) {
              results.push({ ok: false, error: 'BREVO_API_KEY manquante' });
            }
            for (const draft of (BREVO_API_KEY ? (due || []) : [])) {
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
                // Tracer la dernière newsletter par contact (colonne optionnelle)
                await supabase.from('newsletter_contacts')
                  .update({ last_newsletter_sent_at: new Date().toISOString(), last_newsletter_subject: finalSubject })
                  .eq('status', 'active')
                  .eq('brevo_synced', true);
                results.push({ id: draft.id, ok: true });
              } catch(e) { results.push({ id: draft.id, ok: false, error: e.message }); }
            }
          }
          // ── Publications sociales programmées (Facebook + Instagram, envoyées
          // ensemble pour rester synchronisées — voir handlePublishSocial) ──
          let socialResults = [];
          if (await isFeatureEnabled(supabase, 'social_scheduled_send')) {
            const { data: dueSocial } = await supabase
              .from('social_posts')
              .select('*')
              .eq('statut', 'programmé')
              .lte('scheduled_at', new Date().toISOString())
              .limit(5);
            const MAKE_WEBHOOK_URL = process.env.MAKE_SOCIAL_WEBHOOK_URL;
            for (const post of dueSocial || []) {
              try {
                if (!MAKE_WEBHOOK_URL) throw new Error('MAKE_SOCIAL_WEBHOOK_URL manquant');
                const makeRes = await fetch(MAKE_WEBHOOK_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    subject: post.subject, facebook_text: post.facebook_text, instagram_text: post.instagram_text,
                    image_url: post.image_url, schedule_at: null, sent_at: new Date().toISOString()
                  })
                });
                if (!makeRes.ok) throw new Error(`Make.com ${makeRes.status}`);
                await supabase.from('social_posts').update({ statut: 'envoyé', sent_at: new Date().toISOString() }).eq('id', post.id);
                socialResults.push({ id: post.id, ok: true });
              } catch (e) {
                await supabase.from('social_posts').update({ statut: 'échec', error_message: e.message }).eq('id', post.id);
                socialResults.push({ id: post.id, ok: false, error: e.message });
              }
            }
          }

          return res.status(200).json({ success: true, sent: results.filter(r=>r.ok).length, results, social_sent: socialResults.filter(r=>r.ok).length, socialResults });
        } catch(e) {
          return res.status(200).json({ success: false, error: e.message });
        }
      }
      if (getAction === 'cron-relance') {
        try {
          const BREVO_API_KEY = process.env.BREVO_API_KEY;
          const templateId = parseInt(process.env.BREVO_TEMPLATE_ABANDON_CART || '0', 10);
          if (!BREVO_API_KEY || !templateId) {
            return res.status(200).json({ success: false, error: 'BREVO_API_KEY ou BREVO_TEMPLATE_ABANDON_CART manquant' });
          }
          // Commandes pending créées entre 24h et 48h (fenêtre unique, évite les doublons)
          const now = new Date();
          const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
          const h48ago = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
          const { data: pending, error } = await supabase
            .from('preorders')
            .select('id, email, offer, created_at')
            .eq('paid_status', 'pending')
            .not('email', 'is', null)
            .gte('created_at', h48ago)
            .lte('created_at', h24ago);
          if (error) return res.status(200).json({ success: false, error: error.message });
          if (!pending || pending.length === 0) return res.status(200).json({ success: true, sent: 0, message: 'Aucune commande à relancer' });
          const results = [];
          for (const order of pending) {
            try {
              const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  templateId,
                  to: [{ email: order.email }],
                  params: { OFFER: order.offer || 'Oracle Oradia', NAME: '' }
                })
              });
              if (brevoRes.ok) {
                await supabase.from('preorders').update({ relance_sent_at: new Date().toISOString() }).eq('id', order.id);
              }
              results.push({ email: order.email, ok: brevoRes.ok, status: brevoRes.status });
            } catch(e) {
              results.push({ email: order.email, ok: false, error: e.message });
            }
          }
          await logSystemEvent(supabase, { level: 'info', source: 'cron-relance', method: 'GET', path: '/api/admin/data', status_code: 200, message: `Relances envoyées : ${results.filter(r=>r.ok).length}/${results.length}`, details: results });

          // Séquence post-tirage : check-in J+3 puis promo abonnement J+7 (fire-and-forget)
          try {
            const checkinUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/tirages/send-email?action=cron-checkin&cron_secret=${process.env.CRON_SECRET}`;
            fetch(checkinUrl, { method: 'GET' }).catch(e => console.error('[cron-relance] checkin fire error:', e.message));
          } catch(e) { console.error('[cron-relance] checkin launch error:', e.message); }
          try {
            const promoUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/tirages/send-email?action=cron-promo-tirage&cron_secret=${process.env.CRON_SECRET}`;
            fetch(promoUrl, { method: 'GET' }).catch(e => console.error('[cron-relance] promo-tirage fire error:', e.message));
          } catch(e) { console.error('[cron-relance] promo-tirage launch error:', e.message); }

          // Déclencher l'email de clôture des fenêtres d'observation arrivées à terme.
          // AWAIT volontaire (et non fire-and-forget) : sur Vercel, un appel non attendu
          // peut être coupé avant de partir une fois la réponse envoyée. On attend donc
          // la fin de l'envoi pour garantir que les mails de clôture partent réellement.
          // Bénéfice secondaire : maintenir la fonction en vie fiabilise aussi les deux
          // appels fire-and-forget ci-dessus (checkin J+3, promo J+7).
          let fenetreCloseResult = null;
          try {
            const fenetreUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/fenetre/close`;
            const fr = await fetch(fenetreUrl, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
            });
            fenetreCloseResult = await fr.json().catch(() => ({ status: fr.status }));
          } catch(e) {
            console.error('[cron-relance] fenetre-close error:', e.message);
            fenetreCloseResult = { error: e.message };
          }

          return res.status(200).json({ success: true, sent: results.filter(r=>r.ok).length, total: results.length, results, fenetre_close: fenetreCloseResult });
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
            // Ne journaliser un résumé que si quelque chose a réellement été détecté —
            // sinon "0 nouvelles erreurs" toutes les 15 min noie les vraies erreurs dans le bruit.
            if (logsToInsert.length > 0) {
                await logSystemEvent(sb, { level:'info', source:'cron-fetch-logs', message:`Cron logs: ${logsToInsert.length} nouvelle(s) erreur(s) détectée(s) (${candidateLogs.length - logsToInsert.length} doublon(s) ignoré(s))`, details: { deployment: deployment.uid } });
            }
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

      const { email, fullName, accessCode, expiresAt, subscriptionId, isFree } = body;
      // L'action peut arriver dans le corps OU dans l'URL (?action=...). Les boutons
      // "Envoyer test" du dashboard la passent en query — sans ce fallback, body.action
      // restait undefined et aucun de ces envois de mail n'aboutissait.
      const action = body.action || req.query?.action;

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
        const finalAccessCode = accessCode || ('ADMIN-' + Date.now().toString(36).toUpperCase());
        const cleanEmail = email.toLowerCase().trim();
        const { error } = await supabase
          .from('tore_subscriptions')
          .upsert({
            email: cleanEmail,
            full_name: fullName || '',
            access_code: finalAccessCode,
            expires_at: expiresAt || null,
            status: 'active',
            is_free: !!isFree,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'email' });
        if (error) throw error;

        // Abonnement gratuit créé manuellement : envoyer automatiquement au membre
        // ses informations d'accès. Le mot de passe n'est jamais connu du serveur
        // (Supabase Auth) — le membre le crée lui-même à l'inscription.
        let welcomeEmailSent = false;
        if (isFree && process.env.BREVO_API_KEY) {
          try {
            const html = buildFreeSubscriptionWelcomeHtml({ email: cleanEmail, fullName: fullName || '', accessCode: finalAccessCode, expiresAt: expiresAt || null });
            const r = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
              body: JSON.stringify({
                sender: { name: "Rudy d'Oradia", email: 'contact@oradia.fr' },
                to: [{ email: cleanEmail }],
                subject: "Rudy d'Oradia - Votre accès au Tore est activé",
                htmlContent: html
              })
            });
            welcomeEmailSent = r.ok;
          } catch (e) { console.error('[subscriptions/create] welcome email error:', e.message); }
        }
        return res.status(200).json({ success: true, emailSent: welcomeEmailSent });
      }

      if (action === 'revoke' && subscriptionId) {
        const { error } = await supabase
          .from('tore_subscriptions')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('id', subscriptionId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (action === 'set-expiry' && subscriptionId) {
        const { error } = await supabase
          .from('tore_subscriptions')
          .update({ expires_at: body.expiresAt || null, updated_at: new Date().toISOString() })
          .eq('id', subscriptionId);
        if (error) throw error;
        return res.status(200).json({ success: true });
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

      if (action === 'test-subscription-email') {
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configuré' });
        const type = body.type || 'payment_failed';
        const toEmail = body.email || 'contact@oradia.fr';
        const isPaimentFailed = type === 'payment_failed';
        const subject = isPaimentFailed ? "Rudy d'Oradia - Votre paiement n'a pas abouti — renouveler votre accès" : "Rudy d'Oradia - Votre abonnement Le Tore est arrivé à échéance";
        const title = isPaimentFailed ? 'Paiement non abouti' : 'Votre accès a expiré';
        const subtitle = isPaimentFailed ? 'Un problème est survenu lors du renouvellement' : 'Renouvelez votre abonnement pour continuer';
        const bodyText = isPaimentFailed
          ? `Bonjour,<br><br>Nous n'avons pas pu renouveler votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> — votre moyen de paiement n'a pas été accepté.<br><br>Pour continuer à accéder à vos tirages, veuillez mettre à jour votre paiement.`
          : `Bonjour,<br><br>Votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> est arrivé à échéance et votre accès a été suspendu.<br><br>Renouvelez votre abonnement pour retrouver votre espace et continuer vos tirages.`;
        const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;" bgcolor="#050a14"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.png"><tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628"><tr><td style="padding:0;line-height:0;font-size:0;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;"></td></tr><tr><td align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628"><h1 style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">${title}</h1><table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table><p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">${subtitle}</p></td></tr><tr><td style="padding:0 40px 32px;" bgcolor="#0a1628"><p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;">${bodyText}</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="border-radius:6px;" bgcolor="#d4af37"><a href="https://oradia.fr/member/login.html?returnTo=abonnements.html%3FfromEmail%3D1" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">Renouveler mon abonnement</a></td></tr></table></td></tr><tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr><tr><td align="center" style="padding:28px 40px 32px;" bgcolor="#0a1628"><p style="margin:0 0 6px;color:#9ca3af;font-family:Georgia,serif;font-size:13px;font-style:italic;">Avec toute ma gratitude,</p><p style="margin:0 0 4px;color:#f0c75e;font-family:Georgia,serif;font-size:26px;font-weight:bold;letter-spacing:1px;">Rudy</p><p style="margin:0 0 16px;color:#d8bf72;font-family:Georgia,serif;font-size:13px;font-style:italic;">Fondateur d'ORADIA</p><a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-family:Georgia,serif;font-size:13px;letter-spacing:1px;border-bottom:1px solid #8a6d20;padding-bottom:2px;">oradia.fr</a></td></tr><tr><td align="center" style="padding:20px 40px;" bgcolor="#040c1a"><p style="margin:0 0 8px;color:#9ca3af;font-family:Georgia,serif;font-size:12px;line-height:1.6;"><a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a> &nbsp;&middot;&nbsp; <a href="mailto:contact@oradia.fr" style="color:#d4af37;text-decoration:none;">contact@oradia.fr</a></p><p style="margin:0;color:#6b7280;font-family:Georgia,serif;font-size:11px;line-height:1.5;">ORADIA — La Boussole Intérieure<br>Révéler. Transmuter. Relier.</p></td></tr></table></td></tr></table></body></html>`;
        const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr';
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: { email: senderEmail, name: "Rudy d'Oradia" }, to: [{ email: toEmail }], subject, htmlContent: html })
        });
        if (!r.ok) { const t = await r.text(); throw new Error(`Brevo ${r.status}: ${t}`); }
        return res.status(200).json({ success: true, email: toEmail, type });
      }

      if (action === 'test-email') {
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configuré' });
        const type = body.type || '';
        const dest = 'contact@oradia.fr';
        const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr';
        const emailStyle = `background:#050a14;padding:48px 20px;`;
        const containerStyle = `max-width:580px;background:linear-gradient(135deg,#0a1628,#051428);border:1px solid rgba(212,175,55,0.3);`;
        const headerCell = (label, title) => `<tr><td align="center" style="padding:48px 40px 24px;"><p style="margin:0 0 6px;color:rgba(212,175,55,0.5);font-family:'Lora',Georgia,serif;font-size:11px;letter-spacing:0.45em;text-transform:uppercase;">${label}</p><h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;letter-spacing:2px;">${title}</h1><div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:20px auto;"></div></td></tr>`;
        const para = (text) => `<p style="color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;margin-bottom:20px;">${text}</p>`;
        const cta = (label, href) => `<table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0;"><tr><td style="border-radius:4px;background:linear-gradient(135deg,#d4af37,#f0c75e);"><a href="${href}" style="display:inline-block;padding:15px 36px;color:#0a1628;font-family:'Lora',Georgia,serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">${label}</a></td></tr></table>`;
        const footerCell = `<tr><td align="center" style="padding:20px 40px;background:rgba(5,10,20,0.6);border-top:1px solid rgba(212,175,55,0.15);"><p style="margin:0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:11px;line-height:1.6;"><a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a> · <a href="mailto:contact@oradia.fr" style="color:#d4af37;text-decoration:none;">contact@oradia.fr</a><br>ORADIA – La Boussole Intérieure · Révéler. Transmuter. Relier.</p></td></tr>`;
        const wrap = (rows) => `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#050a14;"><table width="100%" cellpadding="0" cellspacing="0" style="${emailStyle}"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="${containerStyle}">${rows}${footerCell}</table></td></tr></table></body></html>`;

        let subject, html;

        if (type === 'free-sub-welcome') {
          // Réutilise le vrai template d'accès (abonnement gratuit manuel) avec des données d'exemple
          subject = "[TEST] Rudy d'Oradia - Votre accès au Tore est activé";
          html = buildFreeSubscriptionWelcomeHtml({
            email: 'contact@oradia.fr',
            fullName: 'Rudy Boucheron',
            accessCode: 'ADMIN-EXEMPLE123',
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          });
        } else if (type === 'newsletter-confirm') {
          subject = "[TEST] Rudy d'Oradia - Bienvenue dans l'univers ORADIA";
          html = wrap(
            headerCell('Bienvenue', 'ORADIA') +
            `<tr><td style="padding:0 40px 40px;">${para('Bienvenue dans l\'univers Oradia ✨')}${para('Votre inscription est confirmée. Vous recevrez les prochaines inspirations d\'ORADIA directement dans votre boîte mail.')}${cta('Explorer ORADIA', 'https://oradia.fr')}</td></tr>`
          );
        } else if (type === 'tore-payment') {
          subject = "[TEST] Rudy d'Oradia - Bienvenue dans Le Tore — Votre abonnement est actif";
          html = wrap(
            headerCell('Abonnement activé', 'Le Tore') +
            `<tr><td style="padding:0 40px 40px;">${para('Votre abonnement au Tore est maintenant actif. Vous avez accès illimité à l\'expérience complète d\'Oradia.')}${para('<strong style="color:#f0c75e;">Accès direct :</strong> Rendez-vous sur la page Tore et connectez-vous à votre espace membre pour commencer votre exploration.')}${cta('Accéder au Tore', 'https://oradia.fr/tore.html')}</td></tr>`
          );
        } else if (type === 'preorder-confirm') {
          subject = "[TEST] Rudy d'Oradia - Votre précommande est confirmée";
          html = wrap(
            headerCell('Précommande confirmée', 'Oracle ORADIA') +
            `<tr><td style="padding:0 40px 40px;">${para('Merci pour votre précommande de l\'Oracle ORADIA. Votre soutien contribue directement à la création de ce projet.')}${para('Vous recevrez un email de suivi dès que l\'oracle sera prêt à être expédié. Livraison estimée : automne 2025.')}${cta('Suivre ma précommande', 'https://oradia.fr')}</td></tr>`
          );
        } else if (type === 'guidance-confirm') {
          subject = "[TEST] Rudy d'Oradia - Votre guidance est confirmée";
          html = wrap(
            headerCell('Guidance confirmée', 'Séance 1h') +
            `<tr><td style="padding:0 40px 40px;">${para('Votre séance de guidance est confirmée. Un lien Jitsi vous sera envoyé le jour J.')}${para('<strong style="color:#f0c75e;">Rappel :</strong> La séance se déroule en visio, à l\'heure convenue. Prévoyez un espace calme.')}${cta('oradia.fr', 'https://oradia.fr')}</td></tr>`
          );
        } else {
          return res.status(400).json({ error: `Type de mail inconnu : ${type}` });
        }

        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: { email: senderEmail, name: "Rudy d'Oradia" }, to: [{ email: dest }], subject, htmlContent: html })
        });
        if (!r.ok) { const t = await r.text(); throw new Error(`Brevo ${r.status}: ${t}`); }
        return res.status(200).json({ success: true, sentTo: dest, type });
      }

      if (action === 'abandon-relance' && body.orderId && body.email) {
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configuré' });
        const templateId = parseInt(process.env.BREVO_TEMPLATE_ABANDON_CART || '0', 10);
        if (!templateId) return res.status(500).json({ error: 'BREVO_TEMPLATE_ABANDON_CART non configuré' });

        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            to: [{ email: body.email, name: body.name || undefined }],
            params: { OFFER: body.offer || '', NAME: body.name || '' }
          })
        });
        if (!brevoRes.ok) {
          const txt = await brevoRes.text();
          throw new Error(`Brevo ${brevoRes.status}: ${txt}`);
        }
        await supabase.from('preorders').update({ relance_sent_at: new Date().toISOString() }).eq('id', body.orderId);
        return res.status(200).json({ success: true, email: body.email });
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

    // ── Déploiements Vercel (rollback de code) ──
    if (section === 'deployments') {
      const token = process.env.VERCEL_TOKEN;
      const projectId = process.env.VERCEL_PROJECT_ID || 'prj_0DJh0iGvBHlRVp6MfrTCUa53Yhkd';
      const teamId = process.env.VERCEL_TEAM_ID || 'team_OH3FH8jY7Lx9tjNcayHH42xg';
      if (!token) return res.status(200).json({ success: false, error: 'VERCEL_TOKEN non configurée' });
      try {
        const r = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=15&state=READY&target=production`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await r.json();
        if (!r.ok) return res.status(200).json({ success: false, error: data.error?.message || 'Erreur Vercel' });
        const deployments = (data.deployments || []).map(d => ({
          uid: d.uid,
          url: d.url,
          created: d.created || d.createdAt,
          commit_message: d.meta?.githubCommitMessage || null,
          commit_sha: d.meta?.githubCommitSha ? d.meta.githubCommitSha.slice(0, 7) : null,
          is_current: d.uid === (data.deployments?.[0]?.uid)
        }));
        return res.status(200).json({ success: true, deployments, project_slug_url: `https://vercel.com/${teamId}/${projectId}` });
      } catch (e) {
        return res.status(200).json({ success: false, error: e.message });
      }
    }

    // ── Sauvegardes de données Supabase (runs du workflow GitHub Actions) ──
    if (section === 'backup-runs') {
      const ghToken = process.env.GITHUB_TOKEN;
      const repo = process.env.GITHUB_REPO || 'Paddy22100/oradia-site';
      if (!ghToken) return res.status(200).json({ success: false, error: 'GITHUB_TOKEN non configurée' });
      try {
        const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/backup-supabase.yml/runs?per_page=12`, {
          headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' }
        });
        const data = await r.json();
        if (!r.ok) return res.status(200).json({ success: false, error: data.message || 'Erreur GitHub' });
        const runs = (data.workflow_runs || []).filter(w => w.conclusion === 'success').map(w => ({
          id: w.id,
          created_at: w.created_at,
          run_number: w.run_number,
          html_url: w.html_url
        }));
        return res.status(200).json({ success: true, runs });
      } catch (e) {
        return res.status(200).json({ success: false, error: e.message });
      }
    }

    // ── Téléchargement d'une sauvegarde (proxy authentifié vers l'artefact GitHub) ──
    if (section === 'backup-download') {
      const ghToken = process.env.GITHUB_TOKEN;
      const repo = process.env.GITHUB_REPO || 'Paddy22100/oradia-site';
      const runId = req.query?.run_id;
      if (!ghToken) return res.status(400).json({ error: 'GITHUB_TOKEN non configurée' });
      if (!runId) return res.status(400).json({ error: 'run_id requis' });
      try {
        const listRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/artifacts`, {
          headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' }
        });
        const listData = await listRes.json();
        const artifact = (listData.artifacts || [])[0];
        if (!artifact) return res.status(404).json({ error: 'Aucune sauvegarde trouvée pour ce run' });
        const dlRes = await fetch(`https://api.github.com/repos/${repo}/actions/artifacts/${artifact.id}/zip`, {
          headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' },
          redirect: 'follow'
        });
        if (!dlRes.ok) return res.status(502).json({ error: 'Téléchargement échoué' });
        const buf = Buffer.from(await dlRes.arrayBuffer());
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="oradia-backup-${runId}.zip"`);
        return res.status(200).send(buf);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
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

    // ── Publier / dépublier un témoignage sur oracle.html (modération manuelle) ──
    if (section === 'support-publish') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
      const body = await parseBody(req);
      const { id, published } = body;
      if (!id) return res.status(400).json({ error: 'id requis' });
      if (published) {
        // Refuse de publier si l'auteur a explicitement refusé (publication='non') —
        // même côté admin, on ne contourne pas ce choix.
        const { data: msg } = await supabase.from('support_messages').select('publication').eq('id', id).maybeSingle();
        if (msg?.publication === 'non') {
          return res.status(403).json({ error: "L'auteur a refusé toute publication publique de ce témoignage." });
        }
      }
      const { error } = await supabase.from('support_messages')
        .update({ published: !!published, published_at: published ? new Date().toISOString() : null })
        .eq('id', id)
        .eq('type', 'temoignage');
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // ── Réponse à un message support, envoyée via Brevo depuis le dashboard ──
    if (section === 'support-reply') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
      const body = await parseBody(req);
      const { id, email, subject, message } = body;
      if (!id || !email || !message) return res.status(400).json({ error: 'id, email et message requis' });

      const safeMsg = String(message)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      const html = `
        <div style="background:#050a14;padding:32px 16px;font-family:Georgia,serif;">
          <div style="max-width:520px;margin:0 auto;background:linear-gradient(135deg,#0a1628,#051428);border:1px solid rgba(212,175,55,0.25);border-radius:16px;padding:40px 32px;">
            <p style="color:#f0c75e;font-size:13px;letter-spacing:0.35em;text-transform:uppercase;text-align:center;margin:0 0 32px;opacity:0.7;">ORADIA</p>
            <p style="color:#d1d5db;font-size:15px;line-height:1.7;margin:0 0 16px;">${safeMsg}</p>
            <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:24px auto;"></div>
            <p style="color:rgba(212,175,55,0.6);font-size:13px;text-align:center;margin:0;">Rudy — Oradia<br><a href="https://oradia.fr" style="color:#f0c75e;">oradia.fr</a></p>
          </div>
        </div>`;

      const brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({
          sender: { name: "Rudy d'Oradia", email: process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr' },
          to: [{ email }],
          subject: subject || 'Réponse à votre message — Oradia',
          htmlContent: html
        })
      });
      if (!brevoResp.ok) {
        const err = await brevoResp.json().catch(() => ({}));
        console.error('Brevo support-reply error:', err);
        return res.status(502).json({ error: 'Envoi Brevo échoué' });
      }

      const { error } = await supabase.from('support_messages')
        .update({ status: 'replied', read_at: new Date().toISOString() })
        .eq('id', id);
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

    if (section === 'observation-windows') {
      // Source 1 : table observation_windows (non-membres / freemium)
      const { data: freeWindows } = await supabase
        .from('observation_windows')
        .select('id, email, created_at, duration_days, closes_at, intention, qrng_source, closing_email_sent_at')
        .order('created_at', { ascending: false })
        .limit(500);

      // Source 2 : table tirages (membres connectés), filtrer ceux ayant une fenêtre activée
      const { data: tiragesWithWindow } = await supabase
        .from('tirages')
        .select('user_id, created_at, intention, observation_window')
        .not('observation_window', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      // Récupérer les emails des membres via auth.users (service role)
      let userEmails = {};
      if (tiragesWithWindow && tiragesWithWindow.length > 0) {
        const userIds = [...new Set(tiragesWithWindow.map(t => t.user_id).filter(Boolean))];
        const { data: { users } = {} } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        if (users) users.forEach(u => { userEmails[u.id] = u.email; });
      }

      // Normaliser les tirages au même format que observation_windows
      const memberWindows = (tiragesWithWindow || [])
        .filter(t => t.observation_window && (t.observation_window.durationDays || t.observation_window.duration_days))
        .map(t => {
          const ow = t.observation_window;
          const durationDays = ow.durationDays || ow.duration_days || null;
          const closesAt = ow.closesAt || ow.closes_at || null;
          return {
            email: userEmails[t.user_id] || null,
            created_at: t.created_at,
            duration_days: durationDays,
            closes_at: closesAt,
            intention: t.intention || '',
            source: 'membre'
          };
        });

      // Fusionner et trier par date décroissante
      const allWindows = [
        ...(freeWindows || []).map(w => ({ ...w, source: 'freemium' })),
        ...memberWindows.map(w => ({ ...w, closing_email_sent_at: null }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Compter les retours questionnaire
      let questionnaire_count = 0;
      const { count: qCount } = await supabase
        .from('synchronicity_stats')
        .select('*', { count: 'exact', head: true });
      if (qCount !== null) questionnaire_count = qCount;

      return res.status(200).json({ success: true, windows: allWindows, questionnaire_count });
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
    const [waitlistRes, preordersRes, donorsRes, singleDrawsRes, supportRes, syncRes, guidancesRes, subscriptionsRes, auditRes] = await Promise.all([
      supabase.from('newsletter_contacts').select('*'),
      supabase.from('preorders').select('*'),
      supabase.from('donors').select('*'),
      supabase.from('tore_subscriptions').select('email, single_draw_credits, status').or('status.eq.single_draw,single_draw_credits.gt.0'),
      supabase.from('support_messages').select('id, type, status, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('synchronicity_responses').select('score_synchronicites', { count: 'exact', head: false }),
      supabase.from('guidances').select('id, amount, status, created_at').in('status', ['confirmed', 'completed']),
      supabase.from('tore_subscriptions').select('email, plan, status, is_free, created_at').neq('status', 'payment_failed').neq('status', 'single_draw').then(r => r.error ? supabase.from('tore_subscriptions').select('email, status, created_at').neq('status', 'payment_failed').neq('status', 'single_draw') : r),
      supabase.from('audit_reports').select('summary').order('created_at', { ascending: false }).limit(1)
    ]);

    const waitlistRows    = waitlistRes.data    || [];
    const preorderRows    = preordersRes.data   || [];
    const donorRows       = donorsRes.data      || [];
    const singleDrawRows  = singleDrawsRes.data || [];
    const recentMessages  = supportRes.data     || [];
    const syncRows        = syncRes.data        || [];
    const latestAudit     = (auditRes.data || [])[0];
    const monitoringCritical = latestAudit?.summary?.critical || 0;
    const syncAvg         = syncRows.length > 0
      ? (syncRows.reduce((s, r) => s + (r.score_synchronicites || 0), 0) / syncRows.length).toFixed(1)
      : null;

    // Calcul tirages ponctuels
    const singleDrawCount  = singleDrawRows.reduce((s, r) => s + (r.single_draw_credits || 0), 0);
    const singleDrawTotal  = singleDrawCount * 3.90;

    // Calcul abonnements Tore (revenus totaux = chaque abonnement × son prix mensuel)
    const subscriptionRows = subscriptionsRes.data || [];
    const planPrice = p => p === 'decouverte' ? 5 : 8;
    // is_free peut être absent si la migration n'a pas tourné — on l'exclut seulement si explicitement true
    const subscriptionsTotal = subscriptionRows.reduce((s, r) => r.is_free === true ? s : s + planPrice(r.plan), 0);
    const SYSTEM_EMAILS = ['audit@oradia.fr', 'contact@oradia.fr'];
    const subscriptionsActive = subscriptionRows.filter(r => r.status === 'active' && !SYSTEM_EMAILS.includes(r.email)).length;

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
        subscriptions: {
          count:  subscriptionsActive,
          total:  subscriptionsTotal
        },
        monitoring: {
          critical: monitoringCritical
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
    source && source.trim()
      ? `Inspire-toi de la ou des source(s) suivante(s) pour illustrer le propos : ${source}.`
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

// Email de bienvenue envoyé automatiquement quand un abonnement Tore GRATUIT
// est créé manuellement depuis le dashboard. Modèle visuel des newsletters
// (fond oradia-hero-4k + carte sombre), bandeau rappel abonnement en tête.
function buildFreeSubscriptionWelcomeHtml({ email, fullName, accessCode, expiresAt }) {
  const bandeau = 'https://oradia.fr/images/medias/bandeau_rappel_abonnement_tore.webp';
  const prenom = (fullName || '').trim().split(/\s+/)[0] || '';
  const expiryLine = expiresAt
    ? `<p style="margin:14px 0 0;color:rgba(212,175,55,0.55);font-family:Georgia,serif;font-size:12px;font-style:italic;">Accès valable jusqu'au ${new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>`
    : '';
  const paragraphs = [
    `${prenom ? prenom + ', v' : 'V'}otre accès à l'espace Tore vient d'être activé. Vous pouvez dès maintenant profiter de tirages illimités, des fenêtres d'observation et de votre historique personnel.`,
    `Voici vos informations d'accès :`
  ];
  const bodyRows = paragraphs.map(p => `
  <tr><td style="padding:0 32px 20px;">
    <div style="color:#c8c0a8; font-size:16px; line-height:1.8; font-family:Georgia,serif; text-align:justify;">${p}</div>
  </td></tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');</style>
</head>
<body style="margin:0; padding:0; background-color:#040d1c;">
<table width="100%" cellpadding="0" cellspacing="0" background="https://oradia.fr/images/oradia-hero-4k.webp" bgcolor="#040d1c" style="background-image:url('https://oradia.fr/images/oradia-hero-4k.webp'); background-size:cover; background-position:center; background-repeat:no-repeat; background-color:#040d1c;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(10,25,47,0.95) 0%, rgba(5,20,40,0.96) 100%); max-width:700px; margin:0 auto; border-radius:16px; overflow:hidden; border:1px solid rgba(212,175,55,0.18); box-shadow:0 10px 40px rgba(0,0,0,0.4);">
  <tr><td style="padding:0; line-height:0;">
    <img src="${bandeau}" alt="Oradia — La Boussole Intérieure" width="700" style="display:block; width:100%; height:auto; max-width:700px;">
  </td></tr>
  <tr><td style="padding:30px 32px 0;">
    <h2 style="color:#d4af37; font-family:Georgia,serif; font-size:24px; margin:0 0 20px;">Bienvenue dans l'espace Tore</h2>
  </td></tr>
  ${bodyRows}
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.07);border:1px solid rgba(212,175,55,0.3);border-radius:14px;">
      <tr><td style="padding:24px 28px;">
        <p style="margin:0 0 10px;color:#c8c0a8;font-family:Georgia,serif;font-size:14px;"><span style="color:rgba(212,175,55,0.6);text-transform:uppercase;font-size:11px;letter-spacing:0.15em;">Identifiant</span><br><strong style="color:#f0c75e;font-size:16px;">${nlEscHtml(email)}</strong></p>
        <p style="margin:0;color:#c8c0a8;font-family:Georgia,serif;font-size:14px;"><span style="color:rgba(212,175,55,0.6);text-transform:uppercase;font-size:11px;letter-spacing:0.15em;">Code d'accès</span><br><strong style="color:#f0c75e;font-size:16px;letter-spacing:0.08em;">${nlEscHtml(accessCode)}</strong></p>
        ${expiryLine}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 24px;">
    <div style="color:#c8c0a8; font-size:14px; line-height:1.8; font-family:Georgia,serif;">Votre mot de passe est personnel : vous le créez vous-même lors de votre première connexion, en vous inscrivant avec cette adresse email. Personne d'autre que vous ne le connaît, pas même moi.</div>
  </td></tr>
  <tr><td style="padding:4px 32px 40px; text-align:center;">
    <a href="https://oradia.fr/inscription" style="display:inline-block; background:linear-gradient(135deg,#d4af37,#f5e7a1); color:#0a192f; text-decoration:none; padding:16px 40px; border-radius:50px; font-weight:700; font-size:16px; letter-spacing:0.05em;">Créer mon mot de passe et accéder au Tore</a>
    <p style="margin:14px 0 0;color:rgba(212,175,55,0.45);font-family:Georgia,serif;font-size:12px;">Déjà un compte ? <a href="https://oradia.fr/connexion" style="color:#d4af37;">Connectez-vous directement</a>.</p>
  </td></tr>
  <tr><td style="padding:36px 32px 28px; border-top:1px solid rgba(212,175,55,0.15); text-align:center;">
    <p style="margin:0 0 6px; color:#c8c0a8; font-size:13px; font-style:italic; opacity:0.7; font-family:Georgia,serif;">Avec gratitude,</p>
    <p style="margin:0 0 4px; color:#d4af37; font-size:52px; font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive; font-weight:700; line-height:1.1; letter-spacing:0.01em;">Rudy</p>
    <p style="margin:0 0 16px; color:#c8c0a8; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; opacity:0.55; font-family:Georgia,serif;">Fondateur d'Oradia</p>
    <p style="margin:0 0 20px;"><a href="https://oradia.fr" style="color:#d4af37; text-decoration:none; font-size:13px; letter-spacing:0.08em; font-family:Georgia,serif;">oradia.fr</a></p>
    <p style="margin:0; color:#c8c0a8; font-size:11px; opacity:0.4; font-family:Georgia,serif;">Tu reçois cet email car un accès à l'espace Tore a été créé pour toi sur oradia.fr.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
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

// Consulte le registre de fonctionnalités. Si la table/migration n'existe pas
// encore, ou si le flag n'est pas défini, on considère la feature active par
// défaut (fail-open) pour ne jamais casser une fonctionnalité existante.
async function isFeatureEnabled(supabase, key) {
  try {
    const { data, error } = await supabase.from('feature_flags').select('enabled').eq('key', key).maybeSingle();
    if (error || !data) return true;
    return data.enabled !== false;
  } catch { return true; }
}

// Construit le HTML complet de l'email (newsletter ou promo) à partir d'un brouillon
function buildCommunicationEmailHtml(draft) {
  const subject = draft.subject || '';
  const displayTitle = subject.replace(/^Rudy d['']ORADIA\s*[-–]\s*/i, '').trim();
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
  const isHtml = /<[a-z][\s\S]*>/i.test(content);
  // Isole les blocs <ul>/<ol> comme paragraphes à part entière (au lieu de les laisser
  // fusionnés avec le texte autour), pour que les listes à puces du générateur survivent
  // jusqu'à l'email final au lieu d'être effacées par le filtre de balises ci-dessous.
  const normalizedContent = isHtml
    ? content.replace(/\s*(<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)\s*/gi, '</p><p>$1</p><p>')
    : content;
  const paragraphs = isHtml
    ? normalizedContent.split(/<\/p>\s*<p[^>]*>/i).map(p => p.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '').trim()).filter(Boolean)
    : normalizedContent.split(/\n+/).map(p => p.trim()).filter(Boolean);
  // Rendu d'un paragraphe : autorise b/strong/i/em/u/br/ul/ol/li, échappe le reste
  const renderPara = (para) => isHtml
    ? para.replace(/<(?!\/?(?:b|strong|i|em|u|br|ul|ol|li)\b)[^>]*>/gi, '')
    : nlEscHtml(para).replace(/\n/g, '<br>');
  const totalParas = paragraphs.length || 1;
  const totalImages = images.length;

  const separator = `
    <tr><td style="padding:4px 40px 4px; text-align:center;">
      <span style="display:inline-block; width:48px; height:1px; background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4)); vertical-align:middle;"></span>
      <span style="display:inline-block; width:6px; height:6px; background:#d4af37; border-radius:50%; opacity:0.55; vertical-align:middle; margin:0 10px;"></span>
      <span style="display:inline-block; width:48px; height:1px; background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent); vertical-align:middle;"></span>
    </td></tr>`;

  const imageRow = (img) => `
    ${separator}
    <tr><td style="padding:8px 20px 8px; text-align:center;">
      <table cellpadding="0" cellspacing="0" style="margin:0 auto; max-width:600px; width:100%; border-radius:14px; overflow:hidden; border:1px solid rgba(212,175,55,0.22); box-shadow:0 6px 28px rgba(0,0,0,0.45);">
        <tr><td style="padding:0; line-height:0;">
          <a href="${nlAbsUrl(img.path)}" target="_blank" style="display:block; line-height:0;">
            <img src="${nlAbsUrl(img.path)}" alt="${nlEscHtml(img.name || '')}" width="600" style="display:block; width:100%; height:auto;">
          </a>
        </td></tr>
      </table>
    </td></tr>
    ${separator}`;

  const paraRow = (para) => {
    const isList = /^<(ul|ol)[\s>]/i.test(para.trim());
    if (isList) {
      // Styles inline sur ul/ol/li — les clients mail ignorent le CSS externe
      const styledList = renderPara(para)
        .replace(/<ul[^>]*>/i, '<ul style="margin:0; padding-left:22px; color:#c8c0a8; font-size:16px; line-height:1.85; font-family:Georgia,serif;">')
        .replace(/<ol[^>]*>/i, '<ol style="margin:0; padding-left:22px; color:#c8c0a8; font-size:16px; line-height:1.85; font-family:Georgia,serif;">')
        .replace(/<li[^>]*>/gi, '<li style="margin-bottom:8px; padding-left:4px;">');
      return `<tr><td style="padding:0 32px 20px;">${styledList}</td></tr>`;
    }
    return `<tr><td style="padding:0 32px 20px;">
    <div style="color:#c8c0a8; font-size:16px; line-height:1.8; font-family:Georgia,serif; text-align:justify;">${renderPara(para)}</div>
  </td></tr>`;
  };

  const placedImages = images.filter(img => img.position !== undefined && img.position !== null && img.position >= 0);
  const unplacedImages = images.filter(img => img.position === undefined || img.position === null || img.position < 0);
  let bodyRows = '';
  if (placedImages.length > 0) {
    const sorted = [...placedImages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    paragraphs.forEach((para, i) => {
      sorted.filter(img => img.position === i).forEach(img => { bodyRows += imageRow(img); });
      bodyRows += paraRow(para);
    });
    sorted.filter(img => img.position >= paragraphs.length).forEach(img => { bodyRows += imageRow(img); });
    // Unplaced images appended after the last paragraph
    unplacedImages.forEach(img => { bodyRows += imageRow(img); });
  } else {
    const allImages = [...images];
    const totalImagesAll = allImages.length;
    let imgIdx = 0;
    paragraphs.forEach((para, i) => {
      while (imgIdx < totalImagesAll && Math.floor((imgIdx + 1) * totalParas / (totalImagesAll + 1)) === i) {
        bodyRows += imageRow(allImages[imgIdx++]);
      }
      bodyRows += paraRow(para);
    });
    while (imgIdx < totalImagesAll) { bodyRows += imageRow(allImages[imgIdx++]); }
  }

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');</style>
</head>
<body style="margin:0; padding:0; background-color:#040d1c;">
<table width="100%" cellpadding="0" cellspacing="0" background="https://oradia.fr/images/oradia-hero-4k.webp" bgcolor="#040d1c" style="background-image:url('https://oradia.fr/images/oradia-hero-4k.webp'); background-size:cover; background-position:center; background-repeat:no-repeat; background-color:#040d1c;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(10,25,47,0.95) 0%, rgba(5,20,40,0.96) 100%); max-width:700px; margin:0 auto; border-radius:16px; overflow:hidden; border:1px solid rgba(212,175,55,0.18); box-shadow:0 10px 40px rgba(0,0,0,0.4);">
  <tr><td style="padding:0; line-height:0;">
    <img src="https://oradia.fr/images/medias/bandeau_newsletter.webp" alt="Oradia — La Boussole Intérieure" width="700" style="display:block; width:100%; height:auto; max-width:700px;">
  </td></tr>
  <tr><td style="padding:30px 32px 0;">
    ${badgeHtml}
    ${displayTitle ? `<h2 style="color:#d4af37; font-family:Georgia,serif; font-size:24px; margin:0 0 20px;">${nlEscHtml(displayTitle)}</h2>` : ''}
  </td></tr>
  ${bodyRows}
  <tr><td style="padding:4px 40px 4px; text-align:center;">
    <span style="display:inline-block; width:48px; height:1px; background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4)); vertical-align:middle;"></span>
    <span style="display:inline-block; width:6px; height:6px; background:#d4af37; border-radius:50%; opacity:0.55; vertical-align:middle; margin:0 10px;"></span>
    <span style="display:inline-block; width:48px; height:1px; background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent); vertical-align:middle;"></span>
  </td></tr>
  <tr><td style="padding:20px 32px 40px; text-align:center;">
    <a href="${nlAbsUrl(ctaUrl).replace(/"/g, '')}" style="display:inline-block; background:linear-gradient(135deg,#d4af37,#f5e7a1); color:#0a192f; text-decoration:none; padding:16px 40px; border-radius:50px; font-weight:700; font-size:16px; letter-spacing:0.05em;">${nlEscHtml(ctaText)}</a>
  </td></tr>
  ${extra.promo_banner ? (() => {
    const b = extra.promo_banner;
    const hasImage = !!b.image;
    const hasCta = !!b.cta_url;
    if (hasImage) {
      // Avec image : l'image porte le message — juste un bandeau CTA sombre en dessous
      return `
  <tr><td style="padding:0 24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(212,175,55,0.3); border-radius:14px; overflow:hidden;">
      <tr><td style="padding:0; line-height:0;">
        <img src="${b.image.replace(/"/g,'')}" alt="" width="100%" style="display:block; width:100%; height:auto;">
      </td></tr>
      ${hasCta ? `<tr><td style="padding:18px 32px; text-align:center; background:linear-gradient(135deg,#0c1e3a,#07152b);">
        <a href="${nlAbsUrl(b.cta_url).replace(/"/g,'')}" style="display:inline-block; background:linear-gradient(135deg,#d4af37,#f5e7a1); color:#0a192f; text-decoration:none; padding:13px 36px; border-radius:50px; font-weight:700; font-size:15px; letter-spacing:0.05em;">${nlEscHtml(b.cta_text || 'En savoir plus')}</a>
      </td></tr>` : ''}
    </table>
  </td></tr>`;
    } else {
      // Sans image : présentation texte classique
      return `
  <tr><td style="padding:0 24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06)); border:1px solid rgba(212,175,55,0.35); border-radius:14px; overflow:hidden;">
      <tr><td style="padding:28px 32px; text-align:center;">
        ${b.title ? `<p style="margin:0 0 8px; color:#d4af37; font-family:Georgia,serif; font-size:20px; font-weight:700; letter-spacing:0.05em;">${nlEscHtml(b.title)}</p>` : ''}
        ${b.desc ? `<p style="margin:0 0 20px; color:#c8c0a8; font-size:13px;">${nlEscHtml(b.desc)}</p>` : '<p style="margin:0 0 20px;"></p>'}
        ${hasCta ? `<a href="${nlAbsUrl(b.cta_url).replace(/"/g,'')}" style="display:inline-block; background:#d4af37; color:#0a192f; text-decoration:none; padding:12px 32px; border-radius:50px; font-weight:700; font-size:14px; letter-spacing:0.05em;">${nlEscHtml(b.cta_text || 'En savoir plus')}</a>` : ''}
      </td></tr>
    </table>
  </td></tr>`;
    }
  })() : ''}
  <tr><td style="padding:36px 32px 28px; border-top:1px solid rgba(212,175,55,0.15); text-align:center;">
    <p style="margin:0 0 6px; color:#c8c0a8; font-size:13px; font-style:italic; opacity:0.7; font-family:Georgia,serif;">Avec gratitude,</p>
    <p style="margin:0 0 4px; color:#d4af37; font-size:52px; font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive; font-weight:700; line-height:1.1; letter-spacing:0.01em;">Rudy</p>
    <p style="margin:0 0 16px; color:#c8c0a8; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; opacity:0.55; font-family:Georgia,serif;">Fondateur d'Oradia</p>
    <p style="margin:0 0 20px; text-align:center;">
      <span style="display:inline-block; width:32px; height:1px; background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4)); vertical-align:middle;"></span>
      <span style="display:inline-block; width:5px; height:5px; background:#d4af37; border-radius:50%; opacity:0.45; vertical-align:middle; margin:0 8px;"></span>
      <span style="display:inline-block; width:32px; height:1px; background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent); vertical-align:middle;"></span>
    </p>
    <p style="margin:0 0 20px;"><a href="https://oradia.fr" style="color:#d4af37; text-decoration:none; font-size:13px; letter-spacing:0.08em; font-family:Georgia,serif;">oradia.fr</a></p>
    <p style="margin:0; color:#c8c0a8; font-size:11px; opacity:0.4; font-family:Georgia,serif;">Vous recevez cet email car vous êtes abonné·e aux communications Oradia.<br><a href="{unsubscribe}" style="color:#c8c0a8; text-decoration:underline;">Se désabonner</a></p>
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

      // ── Liste brute des intentions (anonymisées, triées par date) ──
      if (action === 'list-intentions') {
        const nlSupa = createClient(
          process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const [{ data: fromTirages }, { data: fromAnon }] = await Promise.all([
          nlSupa.from('tirages').select('intention, cartes, created_at').not('intention', 'is', null).neq('intention', '').order('created_at', { ascending: false }).limit(200),
          nlSupa.from('intentions_anonymes').select('intention, cartes, created_at').not('intention', 'is', null).neq('intention', '').order('created_at', { ascending: false }).limit(200)
        ]);
        const all = [
          ...(fromTirages || []).map(r => ({ ...r, source: 'membre' })),
          ...(fromAnon    || []).map(r => ({ ...r, source: 'anonyme' }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return res.status(200).json({ success: true, intentions: all });
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
{"themes":[{"theme":"nom","pourcentage":30,"description":"explication courte"}],"besoins":["besoin 1","besoin 2","besoin 3"],"suggestions_newsletter":[{"sujet":"Titre accrocheur de la newsletter","angle":"angle éditorial en une phrase","contenu":"Corps de la newsletter : 3 à 5 paragraphes courts, ton chaleureux et introspectif, cohérent avec l'univers Oradia. Texte directement réutilisable comme base de rédaction."},{"sujet":"...","angle":"...","contenu":"..."},{"sujet":"...","angle":"...","contenu":"..."}],"cartes_dominantes":${JSON.stringify(topCartes.slice(0, 5))}}

Contraintes : exactement 5 thèmes dont les pourcentages totalisent 100, exactement 3 besoins, exactement 3 suggestions_newsletter avec chacune un contenu rédigé de 150 à 250 mots. N'utilise jamais le tiret long (—) dans aucun texte généré ; remplace-le par une virgule ou reformule la phrase. Dans le contenu des newsletters, lorsque tu mentionnes une carte du Tore, préfixe toujours son nom par "La carte" (ex : "La carte du Bâtisseur", "La carte Archive du Vivant") — jamais le nom seul précédé d'un article simple. Remplace toute occurrence de "Tore intérieur" par "espace intérieur".

IMPORTANT — confidentialité absolue : le texte des newsletters NE DOIT JAMAIS reprendre de détails concrets, spécifiques ou reconnaissables issus des intentions (ex : "vendre son cabinet", "quitter son emploi", "déménager à Lyon"). Travaille uniquement à partir des grandes tendances et des archétypes universels. Un lecteur ne doit jamais pouvoir se reconnaître ou reconnaître la situation d'une autre personne dans le texte. Reste dans le registre du symbolique, du mouvement intérieur, du questionnement universel.`;

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
              body: JSON.stringify({ model, max_tokens: 2400, messages: [{ role: 'user', content: prompt }] }),
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
      if (action === 'preview') {
        const { subject, content, intention, type, images, extra } = body;
        const html = buildCommunicationEmailHtml({ subject, content, intention, type, images: images || [], extra: extra || {} });
        return res.status(200).json({ html });
      }

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

      // Renvoie la dernière newsletter envoyée aux inscrits actifs qui ne l'ont pas reçue
      // (last_newsletter_sent_at nul ou antérieur au sent_at du dernier envoi).
      if (action === 'resend-last') {
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configurée' });

        const { data: lastDraft, error: lastErr } = await supabase
          .from('newsletter_drafts')
          .select('*')
          .eq('statut', 'envoyé')
          .not('sent_at', 'is', null)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastErr) throw lastErr;
        if (!lastDraft) return res.status(404).json({ error: 'Aucune newsletter déjà envoyée' });

        const finalSubject = lastDraft.subject || 'Oradia';
        const html = buildCommunicationEmailHtml({ ...lastDraft, subject: finalSubject });

        const { data: missing, error: missErr } = await supabase
          .from('newsletter_contacts')
          .select('email, last_newsletter_sent_at')
          .eq('status', 'active');
        if (missErr) {
          // Colonne absente (migration last-newsletter non exécutée)
          return res.status(400).json({ error: 'Migration last-newsletter requise (colonne last_newsletter_sent_at absente)' });
        }
        const sentAt = new Date(lastDraft.sent_at);
        const targets = (missing || [])
          .filter(c => !c.last_newsletter_sent_at || new Date(c.last_newsletter_sent_at) < sentAt)
          .map(c => c.email)
          .filter(Boolean);

        if (body.dry_run) {
          return res.status(200).json({ success: true, subject: finalSubject, sent_at: lastDraft.sent_at, targets: targets.length, emails: targets });
        }
        if (targets.length === 0) {
          return res.status(200).json({ success: true, sent: 0, message: 'Tous les inscrits actifs ont déjà reçu cette newsletter' });
        }

        let sent = 0;
        const sentEmails = [];
        const failedEmails = [];
        const BATCH = 10;
        for (let i = 0; i < targets.length; i += BATCH) {
          const batch = targets.slice(i, i + BATCH);
          const results = await Promise.all(batch.map(email => fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
            body: JSON.stringify({
              sender: { name: 'Oradia', email: 'contact@oradia.fr' },
              to: [{ email }],
              subject: finalSubject,
              htmlContent: html.replace('{unsubscribe}', buildUnsubUrl(email))
            })
          })));
          results.forEach((r, idx) => {
            if (r.ok) { sent++; sentEmails.push(batch[idx]); }
            else failedEmails.push(batch[idx]);
          });
        }

        if (sentEmails.length > 0) {
          await supabase
            .from('newsletter_contacts')
            .update({ last_newsletter_sent_at: new Date().toISOString(), last_newsletter_subject: finalSubject })
            .in('email', sentEmails);
        }

        return res.status(200).json({ success: true, subject: finalSubject, sent, failed: failedEmails.length, failedEmails });
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
                htmlContent: html.replace('{unsubscribe}', buildUnsubUrl(email))
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

          // Tracer la dernière newsletter reçue par contact (colonne optionnelle —
          // ignoré silencieusement si la migration last-newsletter n'est pas exécutée)
          if (sentEmails.length > 0) {
            try {
              await supabase
                .from('newsletter_contacts')
                .update({ last_newsletter_sent_at: new Date().toISOString(), last_newsletter_subject: finalSubject })
                .in('email', sentEmails);
            } catch (_) {}
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

        // Tracer la dernière newsletter par contact : la campagne part vers la liste Brevo 5,
        // donc tous les contacts actifs synchronisés sont réputés destinataires.
        // (Colonne optionnelle — ignoré si la migration last-newsletter n'est pas exécutée.)
        try {
          await supabase
            .from('newsletter_contacts')
            .update({ last_newsletter_sent_at: new Date().toISOString(), last_newsletter_subject: finalSubject })
            .eq('status', 'active')
            .eq('brevo_synced', true);
        } catch (_) {}

        await supabase
          .from('newsletter_drafts')
          .update({ statut: 'envoyé', sent_at: new Date().toISOString(), subject: finalSubject, recipients_count: sent })
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

async function handlePublishSocial(req, res) {
  try {
    verifyAdminAuth(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const previewOnly = url.searchParams.get('preview') === '1';

    const body = req.body || {};
    const { subject, textContent, scheduleAt, imageUrl } = body;
    if (!subject || !textContent) return res.status(400).json({ error: 'subject et textContent requis' });

    const MAKE_WEBHOOK_URL = process.env.MAKE_SOCIAL_WEBHOOK_URL;
    if (!previewOnly && !MAKE_WEBHOOK_URL) return res.status(500).json({ error: 'MAKE_SOCIAL_WEBHOOK_URL non configuré' });

    // Si les textes ont déjà été édités côté client, les utiliser directement sans régénérer
    let facebook_text = body.facebook_text || '';
    let instagram_text = body.instagram_text || '';

    if (facebook_text && instagram_text) {
      // Textes fournis — pas de génération IA nécessaire
    } else {
    // Générer les textes adaptés par réseau via Claude
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (ANTHROPIC_API_KEY) {
      const prompt = `Tu es expert en communication digitale pour Oradia, un oracle de développement personnel basé sur le Tore.

Newsletter à adapter :
Sujet : ${subject}
Contenu : ${textContent.substring(0, 1500)}

Génère deux publications séparées :

1. FACEBOOK (300-400 mots, ton inspirant et profond, peut contenir des paragraphes, emoji discrets, appel à l'action vers le site)
2. INSTAGRAM (150-200 mots max, percutant, 5-8 hashtags pertinents en fin de texte, emojis bienvenus)

Réponds UNIQUEMENT en JSON valide avec cette structure :
{"facebook":"texte facebook","instagram":"texte instagram"}

Contraintes : pas de tiret long (—), langage bienveillant et spirituel, ne jamais promettre de résultats garantis.`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const raw = aiData.content?.[0]?.text || '';
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            facebook_text = parsed.facebook || '';
            instagram_text = parsed.instagram || '';
          }
        } catch (_) {}
      }
    }

    // Fallback si l'IA échoue
    if (!facebook_text) facebook_text = `${subject}\n\n${textContent.substring(0, 400)}...\n\nPlus sur oradia.fr`;
    if (!instagram_text) instagram_text = `${subject}\n\n${textContent.substring(0, 150)}...\n\n#oradia #oracle #developpementpersonnel #tore #conscience`;
    } // fin du bloc else (génération IA)

    const DEFAULT_IMAGE = 'https://oradia.fr/images/logo-hd-v2.webp';
    const image_url = imageUrl || DEFAULT_IMAGE;

    // Mode aperçu : retourne le texte sans envoyer à Make.com
    if (previewOnly) {
      return res.status(200).json({ success: true, facebook_text, instagram_text, image_url, preview: true });
    }

    // Si une date est choisie, on N'APPELLE PAS Make.com maintenant : Facebook
    // programmerait son post correctement, mais Instagram (qui ne sait pas
    // programmer nativement) publierait tout de suite, désynchronisant les
    // deux réseaux. On enregistre donc la publication et c'est le cron
    // cron-send-scheduled (toutes les 15 min) qui déclenchera les DEUX
    // réseaux ensemble, exactement au moment dû.
    if (scheduleAt) {
      const sbSocial = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { error: insErr } = await sbSocial.from('social_posts').insert({
        subject, facebook_text, instagram_text, image_url, scheduled_at: new Date(scheduleAt).toISOString()
      });
      if (insErr) return res.status(500).json({ error: 'Erreur enregistrement programmation : ' + insErr.message });
      return res.status(200).json({ success: true, facebook_text, instagram_text, image_url, scheduled: true });
    }

    // Pas de date : publication immédiate, comportement inchangé.
    const payload = { subject, facebook_text, instagram_text, image_url, schedule_at: null, sent_at: new Date().toISOString() };
    const makeRes = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!makeRes.ok) {
      const errText = await makeRes.text();
      return res.status(502).json({ error: 'Make.com webhook error', detail: errText });
    }

    return res.status(200).json({ success: true, facebook_text, instagram_text, image_url });
  } catch (err) {
    if (err.message === 'Unauthorized') return res.status(401).json({ error: 'Non autorisé' });
    console.error('handlePublishSocial error:', err);
    return res.status(500).json({ error: err.message });
  }
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

      // Action "upload-image" : reçoit une image en base64, la stocke dans Supabase Storage
      if (body.action === 'upload-image') {
        const { filename, contentType, base64 } = body;
        if (!filename || !contentType || !base64) {
          return res.status(400).json({ error: 'filename, contentType et base64 requis' });
        }
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(contentType)) {
          return res.status(400).json({ error: 'Type de fichier non autorisé (jpeg, png, webp, gif uniquement)' });
        }
        const sb = createClient(
          process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const buffer = Buffer.from(base64, 'base64');
        const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
        const safeName = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`.replace(/\.+/g, '.');
        const { error: upErr } = await sb.storage
          .from('newsletter-uploads')
          .upload(safeName, buffer, { contentType, upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data: { publicUrl } } = sb.storage.from('newsletter-uploads').getPublicUrl(safeName);
        return res.status(200).json({ success: true, url: publicUrl, name: filename });
      }

      // 1. Images produit (assets statiques du site)
      const produit = NL_PRODUIT_IMAGES
        .map(img => ({ path: `/images/${img.file}`, name: img.name, source: 'local', category: 'produit' }));

      // 2. Ma bibliothèque (images déjà collectées pour les newsletters + illustrations du Tore)
      const ambiance_locale = NL_AMBIANCE_IMAGES
        .map(img => ({ path: `/images/newsletter/ambiance/${img.file}`, name: img.name, source: 'local', category: 'ambiance' }))
        .concat(NL_LIBRARY_IMAGES.map(img => ({ path: img.path, name: img.name, source: 'local', category: img.category || 'bibliotheque' })));

      // 2b. Images importées par l'admin (Supabase Storage bucket "newsletter-uploads")
      try {
        const sbImg = createClient(
          process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const { data: uploaded } = await sbImg.storage.from('newsletter-uploads').list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
        if (uploaded && uploaded.length > 0) {
          uploaded.forEach(file => {
            const { data: { publicUrl } } = sbImg.storage.from('newsletter-uploads').getPublicUrl(file.name);
            ambiance_locale.push({ path: publicUrl, name: file.name.replace(/^\d+_/, '').replace(/\.[^.]+$/, ''), source: 'uploaded', category: 'bibliotheque' });
          });
        }
      } catch(e) { console.error('Erreur listing uploads:', e.message); }

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

    if (path === '/publish-social' || path === '/publish-social/') {
      return await handlePublishSocial(req, res);
    }

    if (path === '/social-posts' || path === '/social-posts/') {
      verifyAdminAuth(req);
      const sbSocialList = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (req.method === 'GET') {
        const { data, error } = await sbSocialList.from('social_posts').select('*').order('scheduled_at', { ascending: true });
        if (error) return res.status(200).json({ success: true, posts: [] }); // migration pas encore exécutée
        return res.status(200).json({ success: true, posts: data || [] });
      }
      if (req.method === 'DELETE') {
        const id = urlParams.get('id');
        if (!id) return res.status(400).json({ error: 'id requis' });
        const { error } = await sbSocialList.from('social_posts').delete().eq('id', id).eq('statut', 'programmé');
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (path === '/sync-brevo-unsubscribes' || path === '/sync-brevo-unsubscribes/') {
      return await handleSyncBrevoUnsubscribes(req, res);
    }

    // ── Statistiques des campagnes newsletter (Brevo) + analyse IA ──
    if (path === '/newsletter-stats' || path === '/newsletter-stats/') {
      verifyAdminAuth(req);
      const BREVO_API_KEY = process.env.BREVO_API_KEY;
      if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configurée' });

      // Récupérer les 20 dernières campagnes envoyées (les statistiques sont
      // incluses par défaut dans la réponse — le paramètre statistics=...
      // provoquait des 503 côté Brevo).
      let campRes = await fetch('https://api.brevo.com/v3/emailCampaigns?status=sent&limit=20&sort=desc', {
        headers: { 'api-key': BREVO_API_KEY }
      });
      if (!campRes.ok) {
        // Nouvelle tentative minimale (certains paramètres combinés déclenchent des 5xx transitoires)
        campRes = await fetch('https://api.brevo.com/v3/emailCampaigns?status=sent', {
          headers: { 'api-key': BREVO_API_KEY }
        });
      }
      if (!campRes.ok) return res.status(502).json({ error: `Brevo ${campRes.status}` });
      const campData = await campRes.json();
      const campaigns = (campData.campaigns || []).map(c => {
        const g = c.statistics?.globalStats || (Array.isArray(c.statistics?.campaignStats) ? c.statistics.campaignStats[0] : null) || {};
        const delivered = g.delivered || 0;
        return {
          id: c.id,
          name: c.name,
          subject: c.subject,
          sentDate: c.sentDate,
          delivered,
          uniqueViews: g.uniqueViews || 0,
          uniqueClicks: g.uniqueClicks || 0,
          unsubscriptions: g.unsubscriptions || 0,
          softBounces: g.softBounces || 0,
          hardBounces: g.hardBounces || 0,
          openRate: delivered ? Math.round((g.uniqueViews || 0) / delivered * 1000) / 10 : 0,
          clickRate: delivered ? Math.round((g.uniqueClicks || 0) / delivered * 1000) / 10 : 0
        };
      });

      // action=analyze : envoyer les stats à Claude pour des pistes d'amélioration
      if (urlParams.get('action') === 'analyze' && req.method === 'POST') {
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });
        const statsText = campaigns.map(c =>
          `- "${c.subject}" (${(c.sentDate || '').slice(0, 10)}) : ${c.delivered} délivrés, ${c.openRate}% ouverture, ${c.clickRate}% clic, ${c.unsubscriptions} désinscriptions`
        ).join('\n');
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1200,
            messages: [{
              role: 'user',
              content: `Tu es consultant email marketing pour Oradia, un oracle de développement personnel (audience francophone, univers spirituel bienveillant, newsletter hebdomadaire, liste modeste en croissance).

Voici les statistiques réelles des dernières campagnes newsletter (référence marché : ~35-40% d'ouverture, ~2-4% de clic pour ce type de niche) :
${statsText}

Analyse ces chiffres et donne :
1. Un constat honnête en 2-3 phrases (tendances, points forts, points faibles)
2. Les 3 pistes d'amélioration les plus impactantes, concrètes et actionnables (objets d'email, moment d'envoi, contenu, segmentation...)
Réponds en français, sans tiret long, format markdown compact.`
            }]
          })
        });
        if (!aiRes.ok) return res.status(502).json({ error: `Anthropic ${aiRes.status}` });
        const aiData = await aiRes.json();
        return res.status(200).json({ success: true, analysis: aiData.content?.[0]?.text || '', campaigns });
      }

      return res.status(200).json({ success: true, campaigns });
    }

    // ── Registre de fonctionnalités : lister / activer / désactiver ──
    // ── Blog : CRUD des articles gérés depuis le dashboard ──
    if (path === '/blog' || path === '/blog/') {
      const sbBlog = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const blogAction = urlParams.get('action') || '';

      // ── Lectures PUBLIQUES (pas d'auth) ──
      if (req.method === 'GET' && blogAction === 'public-list') {
        const { data, error } = await sbBlog.from('blog_articles')
          .select('slug, title, description, cover_image, read_minutes, published_at')
          .eq('published', true).order('published_at', { ascending: false });
        if (error) return res.status(200).json({ success: true, articles: [] });
        res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=120');
        return res.status(200).json({ success: true, articles: data || [] });
      }
      if (req.method === 'GET' && blogAction === 'get' && urlParams.get('slug')) {
        const { data, error } = await sbBlog.from('blog_articles')
          .select('slug, title, description, cover_image, content_html, read_minutes, published_at')
          .eq('slug', urlParams.get('slug')).eq('published', true).maybeSingle();
        if (error || !data) return res.status(404).json({ error: 'Article introuvable' });
        res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=120');
        return res.status(200).json({ success: true, article: data });
      }

      // ── Le reste exige l'authentification admin ──
      verifyAdminAuth(req);

      if (req.method === 'GET' && blogAction === 'get-admin' && urlParams.get('id')) {
        const { data, error } = await sbBlog.from('blog_articles').select('*').eq('id', urlParams.get('id')).maybeSingle();
        if (error || !data) return res.status(404).json({ error: 'Article introuvable' });
        return res.status(200).json({ success: true, article: data });
      }
      if (req.method === 'GET') {
        const { data, error } = await sbBlog.from('blog_articles')
          .select('id, slug, title, description, cover_image, read_minutes, published, created_at, updated_at, published_at')
          .order('updated_at', { ascending: false });
        if (error) return res.status(200).json({ success: true, articles: [] });
        return res.status(200).json({ success: true, articles: data || [] });
      }

      if (req.method === 'POST' && blogAction === 'upload-image') {
        const body = await parseBody(req);
        const dataUrl = String(body.image || '');
        const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
        if (!m) return res.status(400).json({ error: 'Image invalide (attendu data URL base64)' });
        const ext = (m[1].split('/')[1] || 'png').replace('jpeg', 'jpg');
        const buffer = Buffer.from(m[2], 'base64');
        if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image trop lourde (max 5 Mo)' });
        const filename = `article_${Date.now()}.${ext}`;
        const { error: upErr } = await sbBlog.storage.from('blog-images').upload(filename, buffer, { contentType: m[1], upsert: false });
        if (upErr) return res.status(500).json({ error: 'Échec upload : ' + upErr.message });
        const { data: { publicUrl } } = sbBlog.storage.from('blog-images').getPublicUrl(filename);
        return res.status(200).json({ success: true, url: publicUrl });
      }

      if (req.method === 'POST') {
        const body = await parseBody(req);
        const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
        const title = String(body.title || '').trim();
        if (!title) return res.status(400).json({ error: 'Titre requis' });
        const slug = slugify(body.slug || title);
        if (!slug) return res.status(400).json({ error: 'Slug invalide' });
        const now = new Date().toISOString();
        const record = {
          slug, title,
          description: String(body.description || '').trim() || null,
          cover_image: String(body.cover_image || '').trim() || null,
          content_html: String(body.content_html || ''),
          read_minutes: parseInt(body.read_minutes) || 5,
          published: !!body.published,
          updated_at: now
        };
        if (body.published) record.published_at = body.published_at || now;

        if (body.id) {
          const { error } = await sbBlog.from('blog_articles').update(record).eq('id', body.id);
          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ success: true, id: body.id, slug });
        } else {
          record.created_at = now;
          const { data, error } = await sbBlog.from('blog_articles').insert(record).select('id').single();
          if (error) return res.status(500).json({ error: error.message.includes('duplicate') ? 'Un article avec ce slug existe déjà' : error.message });
          return res.status(200).json({ success: true, id: data.id, slug });
        }
      }

      if (req.method === 'DELETE') {
        const id = urlParams.get('id');
        if (!id) return res.status(400).json({ error: 'id requis' });
        const { error } = await sbBlog.from('blog_articles').delete().eq('id', id);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (path === '/features' || path === '/features/') {
      verifyAdminAuth(req);
      const sbFeat = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (req.method === 'GET') {
        const { data, error } = await sbFeat.from('feature_flags').select('*').order('category').order('label');
        if (error) return res.status(200).json({ success: true, features: [] }); // migration pas encore exécutée
        return res.status(200).json({ success: true, features: data || [] });
      }
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const key = String(body.key || '').trim();
        if (!key || typeof body.enabled !== 'boolean') return res.status(400).json({ error: 'key et enabled (boolean) requis' });
        const { error } = await sbFeat.from('feature_flags').update({ enabled: body.enabled, updated_at: new Date().toISOString() }).eq('key', key);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (path === '/env-status' || path === '/env-status/') {
      verifyAdminAuth(req);
      const VARS = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','BREVO_API_KEY','ANTHROPIC_API_KEY','ADMIN_SESSION_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD_HASH','CRON_SECRET','VERCEL_TOKEN','GITHUB_TOKEN','ELEVENLABS_API_KEY'];
      // VERCEL_GIT_COMMIT_MESSAGE = message du commit déployé (nos noms de version
      // sont toujours en 1ère ligne du message, ex: "tore-v3.6.8-mail-checkin-j3-harmonise").
      // Fournie automatiquement par Vercel, aucune configuration nécessaire.
      const commitMsg = (process.env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0].trim();
      return res.status(200).json({
        ...Object.fromEntries(VARS.map(k => [k, !!process.env[k]])),
        _deployedVersion: commitMsg || null
      });
    }

    // ── Prototype livret audio : texte → synthèse vocale (ElevenLabs) ──
    if (path === '/generate-audio' || path === '/generate-audio/') {
      verifyAdminAuth(req);
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const sbAudioFlag = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (!(await isFeatureEnabled(sbAudioFlag, 'audio_livret_prototype'))) {
        return res.status(403).json({ error: 'Fonctionnalité désactivée depuis le registre de fonctionnalités' });
      }
      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      if (!ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ELEVENLABS_API_KEY non configurée' });

      const body = await parseBody(req);
      const text = String(body.text || '').trim();
      if (!text) return res.status(400).json({ error: 'text requis' });
      if (text.length > 4500) return res.status(400).json({ error: `Texte trop long (${text.length} caractères, max 4500 par génération pour rester dans le quota gratuit)` });
      // "Rachel" — voix multilingue par défaut d'ElevenLabs, adaptée au français.
      // Personnalisable : passer un autre voice_id depuis le dashboard.
      const voiceId = String(body.voice_id || '21m00Tcm4TlvDq8ikWAM').trim();

      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY, 'Accept': 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
      });
      if (!ttsRes.ok) {
        const errText = await ttsRes.text().catch(() => '');
        return res.status(502).json({ error: `Erreur ElevenLabs (${ttsRes.status}) : ${errText.slice(0, 300)}` });
      }
      const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

      const sbAudio = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const filename = `audio_${Date.now()}.mp3`;
      const { error: upErr } = await sbAudio.storage
        .from('newsletter-uploads')
        .upload(filename, audioBuffer, { contentType: 'audio/mpeg', upsert: false });
      if (upErr) return res.status(500).json({ error: 'Génération réussie mais échec de l\'hébergement : ' + upErr.message });
      const { data: { publicUrl } } = sbAudio.storage.from('newsletter-uploads').getPublicUrl(filename);

      return res.status(200).json({ success: true, url: publicUrl, characters_used: text.length });
    }

    if (path === '/unsubscribe' || path === '/unsubscribe/') {
      // action=generate : génère le lien pour un email (admin seulement)
      if (urlParams.get('action') === 'generate') {
        verifyAdminAuth(req);
        const email = (urlParams.get('email') || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'email requis' });
        return res.status(200).json({ url: buildUnsubUrl(email) });
      }

      // Endpoint PUBLIC — pas d'auth admin requise
      const email = (urlParams.get('email') || '').trim().toLowerCase();
      const token = (urlParams.get('token') || '').trim();
      if (!email || !token) return res.status(400).json({ error: 'Paramètres manquants' });
      const expectedToken = generateUnsubToken(email);
      if (token !== expectedToken) return res.status(403).json({ error: 'Lien invalide ou expiré' });
      const sb = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      await sb.from('newsletter_contacts')
        .update({ status: 'unsubscribed', brevo_synced: false, unsubscribed_at: new Date().toISOString() })
        .eq('email', email);
      const BREVO_API_KEY = process.env.BREVO_API_KEY;
      if (BREVO_API_KEY) {
        await fetch('https://api.brevo.com/v3/contacts/lists/5/contacts/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
          body: JSON.stringify({ emails: [email] })
        }).catch(() => {});
      }
      return res.status(200).json({ success: true });
    }

    if (path === '/sync-all' || path === '/sync-all/' || path === '/import-brevo' || path === '/import-brevo/') {
      verifyAdminAuth(req);
      const BREVO_API_KEY = process.env.BREVO_API_KEY;
      if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY manquant' });
      const sb = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // ── 1. Brevo → Supabase : récupère tous les contacts liste 5 ──
      let brevoContacts = [];
      let offset = 0;
      const pageSize = 500;
      while (true) {
        const r = await fetch(`https://api.brevo.com/v3/contacts/lists/5/contacts?limit=${pageSize}&offset=${offset}&sort=desc`, {
          headers: { 'api-key': BREVO_API_KEY, 'Accept': 'application/json' }
        });
        if (!r.ok) break;
        const data = await r.json();
        const batch = data.contacts || [];
        brevoContacts = brevoContacts.concat(batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      const now = new Date().toISOString();
      const brevoEmailSet = new Set(brevoContacts.map(c => (c.email || '').toLowerCase().trim()));

      // Upsert dans Supabase — les contacts blacklistés passent en unsubscribed
      let pulled = 0;
      if (brevoContacts.length > 0) {
        const rows = brevoContacts.map(c => ({
          email: (c.email || '').toLowerCase().trim(),
          status: c.emailBlacklisted ? 'unsubscribed' : 'active',
          brevo_synced: !c.emailBlacklisted,
          brevo_synced_at: now,
          source: 'brevo-sync'
        })).filter(r => r.email);
        const { error } = await sb.from('newsletter_contacts')
          .upsert(rows, { onConflict: 'email' });
        if (!error) pulled = rows.length;
      }

      // ── 2. Supabase → Brevo : contacts actifs non encore synchro ──
      const { data: unsynced } = await sb.from('newsletter_contacts')
        .select('email')
        .eq('status', 'active')
        .eq('brevo_synced', false);

      let pushed = 0;
      const toAdd = (unsynced || []).map(c => c.email).filter(e => e && !brevoEmailSet.has(e));
      if (toAdd.length > 0) {
        const r = await fetch('https://api.brevo.com/v3/contacts/lists/5/contacts/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
          body: JSON.stringify({ emails: toAdd })
        }).catch(() => null);
        if (r && (r.ok || r.status === 204)) {
          await sb.from('newsletter_contacts')
            .update({ brevo_synced: true, brevo_synced_at: now })
            .in('email', toAdd);
          pushed = toAdd.length;
        }
      }

      // ── 3. Désinscriptions Brevo → Supabase (contacts blacklistés) ──
      const blacklisted = brevoContacts.filter(c => c.emailBlacklisted).map(c => (c.email || '').toLowerCase().trim()).filter(Boolean);
      let unsubscribed = 0;
      if (blacklisted.length > 0) {
        const { error } = await sb.from('newsletter_contacts')
          .update({ status: 'unsubscribed', brevo_synced: false, unsubscribed_at: now })
          .in('email', blacklisted)
          .neq('status', 'unsubscribed');
        if (!error) unsubscribed = blacklisted.length;
      }

      return res.status(200).json({ success: true, pulled, pushed, unsubscribed });
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

    if (path === '/support-publish' || path === '/support-publish/') {
      // Publier/dépublier un témoignage — délégué à handleData avec section=support-publish
      if (!req.query) req.query = {};
      req.query.section = 'support-publish';
      return await handleData(req, res);
    }

    if (path === '/support-reply' || path === '/support-reply/') {
      // Répondre à un message support via Brevo — délégué à handleData avec section=support-reply
      if (!req.query) req.query = {};
      req.query.section = 'support-reply';
      return await handleData(req, res);
    }

    // ── Témoignages publiés — endpoint PUBLIC, pas d'auth admin (lu par oracle.html) ──
    if (path === '/testimonials' || path === '/testimonials/') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const sbPublic = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (!(await isFeatureEnabled(sbPublic, 'testimonials_public'))) {
        return res.status(200).json({ success: true, testimonials: [] });
      }
      const { data, error } = await sbPublic
        .from('support_messages')
        .select('name, message, publication, published_at')
        .eq('type', 'temoignage')
        .eq('published', true)
        .neq('publication', 'non') // respecte le refus explicite de publication de l'auteur
        .order('published_at', { ascending: false })
        .limit(12);
      if (error) return res.status(500).json({ error: error.message });
      const testimonials = (data || []).map(t => ({
        name: t.publication === 'anonyme' ? null : (t.name || null),
        message: t.message
      }));
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.status(200).json({ success: true, testimonials });
    }

    // ── Étude des synchronicités — statistiques PUBLIQUES anonymisées ──
    // Page etude-synchronicites.html. Ne renvoie QUE des agrégats (aucun texte
    // libre, aucun champ nominatif) — les témoignages restent réservés au
    // dashboard admin, non modérés pour une diffusion publique.
    if (path === '/synchronicity-public' || path === '/synchronicity-public/') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const sbSync = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (!(await isFeatureEnabled(sbSync, 'synchronicity_study_public'))) {
        return res.status(200).json({ success: true, data: { total: 0, avgScore: null, scoreDistrib: [], typeCounts: {}, resonanceCounts: {} } });
      }
      let { data: rows, error: sErr } = await sbSync
        .from('synchronicity_stats')
        .select('score_synchronicites, types_synchronicites, resonance_tirage, qrng_source');
      if (sErr) {
        // Table/colonne absente (migration non exécutée) : renvoyer un jeu vide plutôt qu'une 500
        return res.status(200).json({ success: true, data: { total: 0, avgScore: null, scoreDistrib: [], typeCounts: {}, resonanceCounts: {} } });
      }
      // Validité scientifique : uniquement les tirages 100% quantiques (ANU)
      const anuRows = (rows || []).filter(r => r.qrng_source === 'anu');
      const avgScore = anuRows.length > 0
        ? (anuRows.reduce((s, r) => s + (r.score_synchronicites || 0), 0) / anuRows.length).toFixed(1)
        : null;
      const scoreDistrib = Array.from({ length: 10 }, (_, i) => ({
        score: i + 1,
        count: anuRows.filter(r => r.score_synchronicites === i + 1).length
      }));
      const typeCounts = {};
      anuRows.forEach(r => (r.types_synchronicites || []).forEach(t => { typeCounts[t] = (typeCounts[t] || 0) + 1; }));
      const resonanceCounts = { fort: 0, plutot_oui: 0, peu: 0, non: 0 };
      anuRows.forEach(r => { if (r.resonance_tirage && resonanceCounts[r.resonance_tirage] !== undefined) resonanceCounts[r.resonance_tirage]++; });

      // Compteur public de tirages réalisés (preuve sociale). funnel_events compte
      // TOUS les tirages lancés, y compris les visiteurs anonymes. Dégrade en null
      // si la table n'existe pas — le front n'affiche le compteur que s'il est présent.
      let totalTirages = null;
      try {
        const { count } = await sbSync.from('funnel_events').select('*', { count: 'exact', head: true }).eq('event_name', 'tirage_lance');
        if (typeof count === 'number') totalTirages = count;
      } catch (_) {}

      res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
      return res.status(200).json({
        success: true,
        totalTirages,
        data: { total: anuRows.length, avgScore, scoreDistrib, typeCounts, resonanceCounts }
      });
    }

    // ── Parrainage — endpoints PUBLICS, pas d'auth admin ──
    // action=convert : un filleul vient de compléter son 1er tirage via un lien de parrainage
    // action=claim : le détenteur d'un code vient réclamer les bonus de ses filleuls convertis
    if (path === '/referral' || path === '/referral/') {
      const sbRef = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const refBody = req.method === 'POST' ? await parseBody(req) : {};
      const action = req.method === 'GET' ? urlParams.get('action') : refBody.action;

      if (action === 'convert' && req.method === 'POST') {
        if (!(await isFeatureEnabled(sbRef, 'referral'))) return res.status(200).json({ success: false, reason: 'feature_disabled' });
        const code = String(refBody.code || '').trim().slice(0, 64);
        if (!code) return res.status(400).json({ error: 'code requis' });
        const { error } = await sbRef.from('referral_conversions').insert({ code });
        if (error) return res.status(200).json({ success: false }); // dégrade en silence si migration absente
        return res.status(200).json({ success: true });
      }

      if (action === 'claim' && req.method === 'GET') {
        const code = String(urlParams.get('code') || '').trim().slice(0, 64);
        if (!code) return res.status(400).json({ error: 'code requis' });
        const { data: pending, error } = await sbRef
          .from('referral_conversions')
          .select('id')
          .eq('code', code)
          .is('claimed_at', null)
          .limit(50);
        if (error) return res.status(200).json({ success: true, claimed: 0 });
        if (!pending || pending.length === 0) return res.status(200).json({ success: true, claimed: 0 });
        await sbRef.from('referral_conversions')
          .update({ claimed_at: new Date().toISOString() })
          .in('id', pending.map(p => p.id));
        return res.status(200).json({ success: true, claimed: pending.length });
      }

      return res.status(400).json({ error: 'Action invalide' });
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
        const userAgent = String(body.user_agent || '').slice(0, 500);
        const isNewVisitor = body.is_new_visitor === true;
        // Étape nommée du funnel de conversion (facultatif) — voir funnel_events.
        const FUNNEL_EVENTS = ['intention_saisie', 'tirage_lance', 'analyse_affichee', 'email_laisse'];
        const event = FUNNEL_EVENTS.includes(String(body.event || '')) ? body.event : null;
        if (!sessionId || (!pagePath && !event)) return res.status(204).end();
        // Filtrer les bots connus côté serveur (user-agent)
        const BOT_PATTERN = /bot|crawler|spider|crawling|scraper|headless|phantom|puppeteer|playwright|selenium|webdriver|googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|facebot|facebookexternalhit|ia_archiver|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|ccbot|claudebot|anthropic|amazonbot|applebot|archive\.org|python-requests|python-urllib|go-http|node-fetch|axios|okhttp|curl|wget|libwww|httpclient|scrapy|masscan|zgrab|censys|nuclei|uptimerobot|pingdom|statuscake|newrelic|datadog|site24x7|monitis|lighthouse|pagespeed|gtmetrix|headlesschrome/i;
        // Rejeter aussi les user-agents vides ou trop courts (typique des scripts sans navigateur)
        // et le drapeau headless envoyé par le tracker client.
        if (!userAgent || userAgent.length < 15 || BOT_PATTERN.test(userAgent) || body.headless === true) return res.status(204).end();
        const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
        if (pagePath) {
          await sb.from('page_views').insert({ path: pagePath, referrer: referrer || null, session_id: sessionId, user_agent: userAgent || null, is_new_visitor: isNewVisitor });
        }
        if (event) {
          await sb.from('funnel_events').insert({ session_id: sessionId, event_name: event, path: pagePath || null }).select().single()
            .then(() => {}, () => {}); // ignore silencieusement si la migration n'est pas encore exécutée
        }
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
        const FRIENDLY_NAMES = {
          'google.com': 'Google',
          'google.fr': 'Google',
          'bing.com': 'Bing',
          'yahoo.com': 'Yahoo',
          'duckduckgo.com': 'DuckDuckGo',
          'facebook.com': 'Facebook',
          'lm.facebook.com': 'Facebook',
          'l.facebook.com': 'Facebook',
          'instagram.com': 'Instagram',
          'l.instagram.com': 'Instagram',
          'linkedin.com': 'LinkedIn',
          'lnkd.in': 'LinkedIn',
          'twitter.com': 'X (Twitter)',
          't.co': 'X (Twitter)',
          'x.com': 'X (Twitter)',
          'pinterest.com': 'Pinterest',
          'youtube.com': 'YouTube',
          'tiktok.com': 'TikTok',
          'reddit.com': 'Reddit',
        };
        const EMAIL_DOMAINS = /sendibm|brevo|sendinblue|mailchimp|mailjet|sendgrid|mandrill|mailerlite|constantcontact|campaign-archive|list-manage/i;
        const referrerCounts = {};
        v.forEach(r => {
          let ref = 'Accès direct';
          if (r.referrer) {
            try {
              const hostname = new URL(r.referrer).hostname.replace(/^www\./, '');
              if (SELF_REFERRERS.has(hostname)) return;
              if (EMAIL_DOMAINS.test(hostname)) { ref = 'Email / Newsletter'; }
              else { ref = FRIENDLY_NAMES[hostname] || hostname; }
            } catch(_) { ref = 'Accès direct'; }
          }
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
        // Nouveaux vs anciens visiteurs. Le tracker ne pose is_new_visitor=true que sur la
        // toute première page vue de l'appareil (le flag localStorage est posé aussitôt) :
        // une session est donc "nouvelle" dès qu'UNE de ses vues porte true — peu importe
        // l'ordre de tri des vues.
        const sessionIsNew = {};
        v.forEach(r => {
          if (r.is_new_visitor === true) sessionIsNew[r.session_id] = true;
          else if (r.is_new_visitor === false && !(r.session_id in sessionIsNew)) sessionIsNew[r.session_id] = false;
        });
        let newVisitors = 0, returningVisitors = 0;
        Object.values(sessionIsNew).forEach(isNew => { if (isNew) newVisitors++; else returningVisitors++; });

        // ── Répartition par appareil (depuis le user-agent) ──
        const devices = { mobile: 0, tablette: 0, ordinateur: 0 };
        // Une session = un appareil : on classe sur la 1re vue rencontrée par session.
        const sessionDevice = {};
        v.forEach(r => {
          if (sessionDevice[r.session_id]) return;
          const ua = r.user_agent || '';
          let d = 'ordinateur';
          if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) d = 'tablette';
          else if (/Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua)) d = 'mobile';
          sessionDevice[r.session_id] = d;
        });
        Object.values(sessionDevice).forEach(d => { devices[d] = (devices[d] || 0) + 1; });

        // ── Affluence par heure (0-23) et par jour de semaine (lun-dim) ──
        const byHour = Array(24).fill(0);
        const byWeekday = Array(7).fill(0); // 0 = lundi … 6 = dimanche
        v.forEach(r => {
          const dt = new Date(r.created_at);
          byHour[dt.getHours()]++;
          byWeekday[(dt.getDay() + 6) % 7]++; // convertit dim=0 en fin de semaine
        });

        // ── Pages d'entrée (1re page de chaque session) ──
        const firstBySession = {};
        // v est trié du plus récent au plus ancien : on garde la plus ancienne vue par session
        v.forEach(r => { firstBySession[r.session_id] = r.path; });
        const landingCounts = {};
        Object.values(firstBySession).forEach(p => { landingCounts[p] = (landingCounts[p] || 0) + 1; });
        const landingPages = Object.entries(landingCounts).sort((a,b) => b[1]-a[1]).slice(0,8).map(([path,count]) => ({path,count}));

        return { total_views: v.length, unique_visitors: uniqueSessions, top_pages: topPages, top_referrers: topReferrers, daily_views: dailyViews, bounce_rate: bounceRate, pages_per_visit: pagesPerVisit, new_visitors: newVisitors, returning_visitors: returningVisitors, devices, by_hour: byHour, by_weekday: byWeekday, landing_pages: landingPages };
      };

      // ── Trafic réel (pages vues du site, via js/page-tracker.js) ──
      const { data: views } = await sb.from('page_views').select('created_at,path,referrer,session_id,is_new_visitor,user_agent').gte('created_at', since).not('path', 'like', '/admin%').order('created_at', { ascending: false }).limit(20000);
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
- Pages d'entrée (1re page de la visite) : ${(traffic.landing_pages||[]).map(p => `${p.path} (${p.count})`).join(', ') || 'aucune donnée'}
- Appareils : mobile ${traffic.devices?.mobile||0}, ordinateur ${traffic.devices?.ordinateur||0}, tablette ${traffic.devices?.tablette||0}
- Nouveaux vs récurrents : ${traffic.new_visitors} nouveaux / ${traffic.returning_visitors} récurrents
- Affluence par jour (lun→dim) : ${(traffic.by_weekday||[]).join(', ')}
- Affluence par heure (0h→23h) : ${(traffic.by_hour||[]).join(', ')}
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

      // ── Funnel de conversion : visite tore → intention → tirage → analyse → email → abonnement ──
      // S'appuie sur page_views (déjà en place) + funnel_events (nouvelle table, dégrade
      // proprement si la migration n'a pas encore été exécutée).
      let funnel = null;
      try {
        const [{ data: toreViews }, { data: events }, { count: newSubs }] = await Promise.all([
          sb.from('page_views').select('session_id').gte('created_at', since).ilike('path', '%tore.html%'),
          sb.from('funnel_events').select('session_id, event_name').gte('created_at', since),
          sb.from('tore_subscriptions').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('status', 'active')
        ]);
        const distinctCount = (rows, filterFn) => new Set((rows || []).filter(filterFn || (() => true)).map(r => r.session_id)).size;
        funnel = {
          visites:            new Set((toreViews || []).map(r => r.session_id)).size,
          intentions_saisies: distinctCount(events, e => e.event_name === 'intention_saisie'),
          tirages_lances:     distinctCount(events, e => e.event_name === 'tirage_lance'),
          analyses_affichees: distinctCount(events, e => e.event_name === 'analyse_affichee'),
          emails_laisses:     distinctCount(events, e => e.event_name === 'email_laisse'),
          abonnements:        newSubs || 0
        };
      } catch (_) { /* migration funnel_events pas encore exécutée — on omet simplement le funnel */ }

      if (req.method !== 'GET') return res.status(405).end();
      return res.status(200).json({
        success: true,
        range,
        traffic,
        funnel,
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

