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
const { sendToreSubscriptionEmail, sendSubscriptionEmail, sendToreCheckinReminderEmail } = require('../../lib/tore-subscription-email.js');
const { sendWaitlistConfirmationEmail } = require('../waitlist.js');
const { sendGuidanceConfirmationEmail } = require('../../lib/guidance-email.js');
const { estimateStripeFees, getStripeFeesForPeriod, getMonthlyStripeFees, ESTIMATE_RATE, ESTIMATE_FIXED_EUR } = require('../../lib/stripe-fees.js');
const sharp = require('sharp');

// Instagram/Facebook rejettent les images dont le ratio largeur/hauteur sort de [0.8, 1.91]
// (erreur Graph API 36003). Plutôt que de bloquer la publication, on recadre en douceur :
// fond flou (extrait de l'image elle-même) qui comble les bords, sujet original intact au
// centre, sans déformation ni recadrage du sujet. Retourne null si le ratio est déjà correct
// (aucun traitement nécessaire) ou en cas d'erreur (on republie alors l'image d'origine).
async function normalizeImageForSocial(imageUrl) {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    const ratio = meta.width / meta.height;
    if (ratio >= 0.8 && ratio <= 1.91) return null;

    let targetW, targetH;
    if (ratio < 0.8) {
      targetH = meta.height;
      targetW = Math.round(targetH * 0.82);
    } else {
      targetW = meta.width;
      targetH = Math.round(targetW / 1.88);
    }

    const background = await sharp(buf)
      .resize(targetW, targetH, { fit: 'cover' })
      .blur(45)
      .modulate({ brightness: 0.55 })
      .toBuffer();

    const foreground = await sharp(buf)
      .resize(targetW, targetH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    return await sharp(background)
      .composite([{ input: foreground, gravity: 'center' }])
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch (e) {
    console.error('[normalizeImageForSocial] erreur:', e.message);
    return null;
  }
}

// Normalise l'image si besoin et la republie dans Supabase Storage (bucket newsletter-uploads,
// déjà utilisé pour les autres images de newsletter) ; renvoie l'URL à utiliser pour la
// publication (URL republiée si recadrage effectué, sinon l'URL d'origine inchangée).
async function ensureSafeSocialImageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;
  const normalized = await normalizeImageForSocial(imageUrl);
  if (!normalized) return imageUrl;
  try {
    const sb = createClient(
      process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const filename = `social_${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage.from('newsletter-uploads').upload(filename, normalized, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: { publicUrl } } = sb.storage.from('newsletter-uploads').getPublicUrl(filename);
    return publicUrl;
  } catch (e) {
    console.error('[ensureSafeSocialImageUrl] upload échoué, image d\'origine conservée:', e.message);
    return imageUrl;
  }
}

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

// Sources de hasard considérées comme quantique vérifié (valides pour l'étude scientifique).
// Toute autre valeur (fallback crypto, unknown) est exclue des statistiques de synchronicité.
const QUANTUM_SOURCES = ['anu', 'outshift'];

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
  // Un contact désinscrit ne doit JAMAIS être (ré)ajouté à la liste 5. On le blackliste
  // et on le retire de la liste, quelle que soit sa catégorie. La désinscription locale
  // est toujours prioritaire sur la synchronisation.
  if (contact.status === 'unsubscribed') {
    try {
      await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(contact.email)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
        body: JSON.stringify({ emailBlacklisted: true })
      });
      await fetch('https://api.brevo.com/v3/contacts/lists/5/contacts/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
        body: JSON.stringify({ emails: [contact.email] })
      });
    } catch (e) { console.error('Brevo unsub-sync error for', contact.email, e.message); }
    return;
  }
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

// Mail de rappel doux avant renouvellement d'abonnement Tore (une fois par cycle).
async function sendRenewalReminderEmail(email, expiresAt) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr';
  if (!BREVO_API_KEY) return false;
  const dateStr = expiresAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#040d1c;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#040d1c" background="https://oradia.fr/images/oradia-hero-4k.webp" style="background-color:#040d1c; background-image:url('https://oradia.fr/images/oradia-hero-4k.webp'); background-size:cover; background-position:center; background-repeat:no-repeat;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a192f" style="max-width:600px;margin:0 auto;background-color:#0a192f;border:1px solid rgba(212,175,55,0.2);border-radius:16px;overflow:hidden;">
  <tr><td style="padding:0;line-height:0;"><img src="https://oradia.fr/images/medias/bandeau_rappel_abonnement_tore.webp" alt="Le Tore" width="600" style="display:block;width:100%;height:auto;"></td></tr>
  <tr><td style="padding:32px 40px 12px;">
    <h1 style="margin:0 0 18px;color:#f0c75e;font-family:Georgia,serif;font-size:26px;font-weight:400;">Votre abonnement se renouvelle bientôt</h1>
    <p style="margin:0 0 16px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;">Bonjour,<br><br>Votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> se renouvellera automatiquement le <strong style="color:#f0c75e;">${dateStr}</strong>. Vous n'avez rien à faire : vos tirages continuent sans interruption.</p>
    <p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;">Pensez simplement à vérifier que votre moyen de paiement est toujours valide, pour éviter toute coupure d'accès.</p>
  </td></tr>
  <tr><td align="center" style="padding:0 40px 36px;">
    <a href="https://oradia.fr/member/login.html?returnTo=abonnements.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a192f;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:700;font-size:15px;font-family:Georgia,serif;">Gérer mon abonnement</a>
  </td></tr>
  <tr><td align="center" style="padding:24px 40px;border-top:1px solid rgba(212,175,55,0.15);">
    <p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">Avec gratitude,</p>
    <p style="margin:0;color:#d4af37;font-size:40px;font-family:'Dancing Script','Brush Script MT',cursive;line-height:1.1;">Rudy</p>
    <p style="margin:12px 0 14px;"><a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:12px;">oradia.fr</a></p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.png" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.png" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
  </td></tr>
</table></td></tr></table></body></html>`;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { email: senderEmail, name: "Rudy d'Oradia" },
        to: [{ email }],
        replyTo: { email: 'contact@oradia.fr', name: "Rudy d'Oradia" },
        subject: "Rudy d'Oradia - Votre abonnement Le Tore se renouvelle bientôt",
        htmlContent: html
      })
    });
    return r.ok;
  } catch (e) { console.error('[renewal-reminder] envoi échoué:', e.message); return false; }
}

// Publie les posts sociaux programmés arrivés à échéance (Facebook + Instagram
// ensemble via Make.com). Utilisé par le cron quotidien ET le cron horaire.
async function sendDueSocialPosts(supabase) {
  const out = { sent: 0, failed: 0, results: [] };
  if (!(await isFeatureEnabled(supabase, 'social_scheduled_send'))) { out.skipped = 'feature_off'; return out; }
  const { data: dueSocial } = await supabase
    .from('social_posts').select('*')
    .eq('statut', 'programmé')
    .lte('scheduled_at', new Date().toISOString())
    .limit(10);
  const MAKE_WEBHOOK_URL = process.env.MAKE_SOCIAL_WEBHOOK_URL;
  for (const post of dueSocial || []) {
    try {
      if (!MAKE_WEBHOOK_URL) throw new Error('MAKE_SOCIAL_WEBHOOK_URL manquant');
      const makeRes = await fetch(MAKE_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: post.subject, facebook_text: post.facebook_text, instagram_text: post.instagram_text, image_url: post.image_url, schedule_at: null, sent_at: new Date().toISOString() })
      });
      if (!makeRes.ok) throw new Error(`Make.com ${makeRes.status}`);
      await supabase.from('social_posts').update({ statut: 'envoyé', sent_at: new Date().toISOString() }).eq('id', post.id);
      out.sent++; out.results.push({ id: post.id, ok: true });
    } catch (e) {
      await supabase.from('social_posts').update({ statut: 'échec', error_message: e.message }).eq('id', post.id);
      out.failed++; out.results.push({ id: post.id, ok: false, error: e.message });
    }
  }
  return out;
}

// Réconciliation Stripe → Supabase + rappel de renouvellement.
// Filet de sécurité : lit la vérité côté Stripe (fin de période + statut) et l'aligne
// dans tore_subscriptions, même si un événement webhook a été manqué. Envoie un rappel
// doux quelques jours avant l'échéance (une seule fois par cycle de facturation).
async function reconcileStripeSubscriptions(supabase) {
  const out = { checked: 0, updated: 0, reminders: 0, errors: [] };
  if (!process.env.STRIPE_SECRET_KEY) { out.errors.push('STRIPE_SECRET_KEY manquante'); return out; }
  let stripe;
  try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); }
  catch (e) { out.errors.push('stripe init: ' + e.message); return out; }

  const REMINDER_DAYS = 3;
  const now = Date.now();

  // Parcours de tous les abonnements Stripe (client étendu pour récupérer l'email)
  const subs = [];
  try {
    let startingAfter;
    while (true) {
      const page = await stripe.subscriptions.list({
        status: 'all', limit: 100, expand: ['data.customer'],
        ...(startingAfter ? { starting_after: startingAfter } : {})
      });
      subs.push(...page.data);
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
  } catch (e) { out.errors.push('list subs: ' + e.message); return out; }

  for (const sub of subs) {
    out.checked++;
    try {
      const customerId = (typeof sub.customer === 'object' ? sub.customer?.id : sub.customer) || null;
      const email = (typeof sub.customer === 'object' ? sub.customer?.email : null) || null;
      // Fin de période : racine (ancien format) ou items (API Stripe récente)
      const periodEndUnix = sub.current_period_end || sub.items?.data?.[0]?.current_period_end || null;
      const expiresAt = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
      const st = sub.status;
      const mappedStatus = (st === 'active' || st === 'trialing') ? 'active'
        : (st === 'past_due' || st === 'unpaid') ? 'payment_failed'
        : (st === 'canceled') ? 'cancelled'
        : null; // incomplete / paused : on ne touche pas
      if (!mappedStatus) continue;

      // Retrouver la ligne : sub id, puis customer id, puis email
      const trySelect = async (col, val) => {
        if (!val) return null;
        const { data } = await supabase.from('tore_subscriptions')
          .select('id, email, is_free, expires_at').eq(col, val).limit(1);
        return Array.isArray(data) && data[0] ? data[0] : null;
      };
      const row = await trySelect('stripe_subscription_id', sub.id)
        || await trySelect('stripe_customer_id', customerId)
        || await trySelect('email', email);
      if (!row) continue;

      const currentExp = row.expires_at ? new Date(row.expires_at).getTime() : null;
      if (expiresAt && currentExp !== expiresAt.getTime()) {
        await supabase.from('tore_subscriptions').update({
          status: mappedStatus,
          expires_at: expiresAt.toISOString(),
          stripe_subscription_id: sub.id,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString()
        }).eq('id', row.id);
        out.updated++;
      }

      // Rappel de renouvellement (une fois par cycle). Isolé dans un try : si la colonne
      // renewal_reminder_for n'existe pas encore (migration non lancée), on saute sans casser.
      if (mappedStatus === 'active' && !row.is_free && expiresAt && email && !sub.cancel_at_period_end) {
        const daysLeft = (expiresAt.getTime() - now) / 86400000;
        if (daysLeft > 0 && daysLeft <= REMINDER_DAYS) {
          try {
            const { data: rr } = await supabase.from('tore_subscriptions')
              .select('renewal_reminder_for').eq('id', row.id).single();
            const already = rr?.renewal_reminder_for
              && Math.abs(new Date(rr.renewal_reminder_for).getTime() - expiresAt.getTime()) < 86400000;
            if (!already) {
              const ok = await sendRenewalReminderEmail(email, expiresAt);
              if (ok) {
                await supabase.from('tore_subscriptions')
                  .update({ renewal_reminder_for: expiresAt.toISOString() }).eq('id', row.id);
                out.reminders++;
              }
            }
          } catch (colErr) { /* colonne absente : rappels inactifs jusqu'à migration */ }
        }
      }
    } catch (e) { out.errors.push((sub.id || '?') + ': ' + e.message); }
  }
  return out;
}

// Cherche un utilisateur Supabase Auth par email (l'API Admin n'a pas de lookup direct
// par email, seulement par id — on parcourt donc les pages de listUsers). Même approche
// que la branche "email non confirmé" de handleLogin (api/auth/index.js).
async function findAuthUserByEmail(supabase, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const found = data.users.find(u => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null; // dernière page
  }
  return null;
}

// Envoie le mail de check-in "vous n'avez pas fait de tirage" pour UN abonné Tore.
// Réutilisé par le cron quotidien (nouveaux abonnés à J+7), par le renvoi manuel
// depuis l'onglet Abonnements et par le bouton de test de l'onglet Mails.
// force=true : ignore les gardes-fous "déjà envoyé" / "a bien fait un tirage" — utilisé
// pour un renvoi manuel volontaire (ex: Rudy soupçonne un problème malgré tout).
async function sendToreCheckinForSubscription(supabase, subscriptionId, { force = false } = {}) {
  const { data: sub, error: fetchErr } = await supabase
    .from('tore_subscriptions')
    .select('id, email, full_name, plan, created_at, must_change_password, checkin_email_sent_at, status')
    .eq('id', subscriptionId)
    .single();
  if (fetchErr || !sub?.email) return { sent: false, reason: 'not_found' };

  if (!force && sub.checkin_email_sent_at) return { sent: false, reason: 'already_sent' };

  let hasDraw = false;
  try {
    const { data: tirages } = await supabase.rpc('admin_get_tirages_by_email', { p_email: sub.email });
    if (Array.isArray(tirages) && sub.created_at) {
      hasDraw = tirages.some(t => t.created_at && new Date(t.created_at) > new Date(sub.created_at));
    }
  } catch (e) { console.error('[checkin] tirages lookup error:', e.message); }

  if (hasDraw && !force) {
    // Pas de souci détecté : on marque quand même comme "traité" pour ne pas
    // réévaluer cet abonné chaque jour indéfiniment.
    await supabase.from('tore_subscriptions').update({ checkin_email_sent_at: new Date().toISOString() }).eq('id', sub.id)
      .then(({ error }) => { if (error) console.error('[checkin] marquage has_draw échoué (migration appliquée ?):', error.message); });
    return { sent: false, reason: 'has_draw' };
  }

  // Mot de passe provisoire toujours pas changé : on en régénère un nouveau (l'ancien
  // n'a jamais été stocké en clair côté serveur) pour pouvoir le rappeler dans l'email.
  let tempPassword = null;
  if (sub.must_change_password) {
    const authUser = await findAuthUserByEmail(supabase, sub.email);
    if (authUser) {
      tempPassword = crypto.randomBytes(8).toString('hex');
      const { error: updErr } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: tempPassword,
        user_metadata: { ...authUser.user_metadata, must_change_password: true }
      });
      if (updErr) {
        console.error('[checkin] régénération mot de passe échouée:', updErr.message);
        tempPassword = null;
      }
    }
  }

  const emailSent = await sendToreCheckinReminderEmail({
    toEmail: sub.email,
    toName: sub.full_name || '',
    tempPassword
  });

  const { error: markErr } = await supabase
    .from('tore_subscriptions')
    .update({ checkin_email_sent_at: new Date().toISOString() })
    .eq('id', sub.id);
  if (markErr) console.error('[checkin] marquage checkin_email_sent_at échoué (migration appliquée ?):', markErr.message);

  return { sent: emailSent, reason: emailSent ? 'ok' : 'brevo_error', hadTempPassword: !!tempPassword };
}

// Cron quotidien : trouve les abonnés Tore payants actifs depuis 7 jours ou plus, jamais
// notifiés (checkin_email_sent_at IS NULL), et déclenche sendToreCheckinForSubscription
// pour chacun. Dégrade proprement si la migration must_change_password/checkin_email_sent_at
// n'a pas encore été appliquée (colonne absente → erreur récupérée, cron marqué en échec
// mais sans planter le reste des tâches quotidiennes).
async function sendToreCheckinReminders(supabase) {
  const out = { checked: 0, sent: 0, skipped_has_draw: 0, already_sent: 0, errors: [] };
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('tore_subscriptions')
    .select('id')
    .eq('status', 'active')
    .not('stripe_subscription_id', 'is', null)
    .is('checkin_email_sent_at', null)
    .lte('created_at', sevenDaysAgo)
    .limit(200);

  if (error) {
    out.errors.push('select: ' + error.message + ' (migration supabase-migration-tore-checkin.sql appliquée ?)');
    return out;
  }

  for (const row of rows || []) {
    out.checked++;
    try {
      const r = await sendToreCheckinForSubscription(supabase, row.id);
      if (r.sent) out.sent++;
      else if (r.reason === 'has_draw') out.skipped_has_draw++;
      else if (r.reason === 'already_sent') out.already_sent++;
      else if (r.reason !== 'ok') out.errors.push(`${row.id}: ${r.reason}`);
    } catch (e) { out.errors.push(`${row.id}: ${e.message}`); }
  }
  return out;
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
          if (!(await isFeatureEnabled(supabase, 'newsletter_scheduled_send'))) {
            return res.status(200).json({ success: true, sent: 0, skipped_reason: 'feature_disabled' });
          }
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
                  // Campagne (un seul HTML pour toute la liste) : on ne peut pas injecter
                  // un token par destinataire, donc on utilise la variable native Brevo
                  // {{ unsubscribe }} — le désabonnement remonte ensuite via le webhook Brevo.
                  htmlContent: html.replace('{unsubscribe}', '{{ unsubscribe }}'),
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
          // ── Publications sociales programmées (Facebook + Instagram, envoyées
          // ensemble pour rester synchronisées — voir handlePublishSocial) ──
          const socialOut = await sendDueSocialPosts(supabase);
          const socialResults = socialOut.results;

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
            await logSystemEvent(supabase, { level: 'info', source: 'cron-relance', method: 'POST', path: '/api/fenetre/close', status_code: fr.status, message: `Fenêtres clôturées : ${fenetreCloseResult?.processed ?? '?'} mail(s) questionnaire envoyé(s)`, details: fenetreCloseResult });
          } catch(e) {
            console.error('[cron-relance] fenetre-close error:', e.message);
            fenetreCloseResult = { error: e.message };
            await logSystemEvent(supabase, { level: 'error', source: 'cron-relance', method: 'POST', path: '/api/fenetre/close', status_code: 500, message: `Échec clôture fenêtres : ${e.message}`, details: null });
          }

          // Réconciliation des abonnements Stripe (filet de sécurité renouvellements) + rappels.
          let reconcileResult = null;
          try {
            reconcileResult = await reconcileStripeSubscriptions(supabase);
            await logSystemEvent(supabase, { level: reconcileResult.errors.length ? 'warn' : 'info', source: 'cron-relance', method: 'GET', path: '/api/admin/data', status_code: 200, message: `Réconciliation Stripe : ${reconcileResult.checked} vérifié(s), ${reconcileResult.updated} mis à jour, ${reconcileResult.reminders} rappel(s)`, details: reconcileResult });
          } catch(e) {
            reconcileResult = { error: e.message };
            await logSystemEvent(supabase, { level: 'error', source: 'cron-relance', method: 'GET', path: '/api/admin/data', status_code: 500, message: `Échec réconciliation Stripe : ${e.message}`, details: null });
          }

          // Check-in J+7 : abonnés Tore payants sans tirage depuis leur paiement.
          let checkinResult = null;
          try {
            checkinResult = await sendToreCheckinReminders(supabase);
            await logSystemEvent(supabase, { level: checkinResult.errors.length ? 'warn' : 'info', source: 'cron-relance', method: 'GET', path: '/api/admin/data', status_code: 200, message: `Check-in Tore J+7 : ${checkinResult.checked} vérifié(s), ${checkinResult.sent} mail(s) envoyé(s)`, details: checkinResult });
          } catch(e) {
            checkinResult = { error: e.message };
            await logSystemEvent(supabase, { level: 'error', source: 'cron-relance', method: 'GET', path: '/api/admin/data', status_code: 500, message: `Échec check-in Tore J+7 : ${e.message}`, details: null });
          }

          return res.status(200).json({ success: true, sent: results.filter(r=>r.ok).length, total: results.length, results, fenetre_close: fenetreCloseResult, reconcile: reconcileResult, tore_checkin: checkinResult });
        } catch(e) {
          return res.status(200).json({ success: false, error: e.message });
        }
      }
      // Check-in Tore J+7 déclenchable seul (cron externe quotidien ou test manuel).
      if (getAction === 'cron-tore-checkin') {
        if ((req.query?.cron_secret || '') !== process.env.CRON_SECRET) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
          const r = await sendToreCheckinReminders(supabase);
          await logSystemEvent(supabase, { level: r.errors.length ? 'warn' : 'info', source: 'cron-tore-checkin', method: 'GET', path: '/api/admin/data', status_code: 200, message: `Check-in Tore J+7 : ${r.checked} vérifié(s), ${r.sent} mail(s) envoyé(s)`, details: r });
          return res.status(200).json({ success: true, ...r });
        } catch(e) {
          return res.status(200).json({ success: false, error: e.message });
        }
      }
      // Publication des posts sociaux dus, déclenchable seule (cron externe horaire).
      if (getAction === 'cron-social-due') {
        if ((req.query?.cron_secret || '') !== process.env.CRON_SECRET) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
          const r = await sendDueSocialPosts(supabase);
          if (r.sent || r.failed) {
            await logSystemEvent(supabase, { level: r.failed ? 'warn' : 'info', source: 'cron-social-due', method: 'GET', path: '/api/admin/data', status_code: 200, message: `Posts sociaux : ${r.sent} publié(s), ${r.failed} échec(s)`, details: r });
          }
          return res.status(200).json({ success: true, ...r });
        } catch(e) {
          return res.status(200).json({ success: false, error: e.message });
        }
      }
      // Réconciliation Stripe déclenchable seule (cron externe horaire ou test manuel).
      if (getAction === 'cron-reconcile-subs') {
        if ((req.query?.cron_secret || '') !== process.env.CRON_SECRET) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
          const r = await reconcileStripeSubscriptions(supabase);
          await logSystemEvent(supabase, { level: r.errors.length ? 'warn' : 'info', source: 'cron-reconcile-subs', method: 'GET', path: '/api/admin/data', status_code: 200, message: `Réconciliation Stripe : ${r.checked} vérifié(s), ${r.updated} mis à jour, ${r.reminders} rappel(s)`, details: r });
          return res.status(200).json({ success: true, ...r });
        } catch(e) {
          return res.status(200).json({ success: false, error: e.message });
        }
      }
      if (getAction === 'cron-retro-pool') {
        // Étude rétrocausalité : (1) remplit le pool quantique pré-scellé si bas,
        // (2) résout les "futurs" en attente (octet scellé APRÈS l'intention).
        const sb = supabase;
        try {
          const crypto = require('crypto');
          const out = { filled: 0, resolved: 0, source: null };

          // (1) Remplissage — uniquement du vrai quantique (ANU ou Outshift/Cisco),
          //     jamais de pseudo-hasard local (sinon l'étude serait polluée).
          const { count: available } = await sb.from('retro_pool').select('*', { count: 'exact', head: true }).is('consumed_at', null);
          const LOW = 200, BATCH = 1024;
          const OUTSHIFT_BATCH = 1000; // limite documentée par Outshift : 1000 blocs max par appel
          if ((available || 0) < LOW) {
            let numbers = null;
            let poolSource = null;

            // Source 1 : Outshift QRNG (Cisco) — priorité (quota bien plus généreux que le plan gratuit ANU)
            if (process.env.OUTSHIFT_QRNG_API_KEY) {
              try {
                const r = await fetch('https://api.qrng.outshift.com/api/v1/random_numbers', {
                  method: 'POST',
                  headers: { 'x-id-api-key': process.env.OUTSHIFT_QRNG_API_KEY, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ encoding: 'raw', format: 'decimal', bits_per_block: 8, number_of_blocks: OUTSHIFT_BATCH }),
                  signal: AbortSignal.timeout(8000)
                });
                out.source = `outshift_${r.status}`;
                if (r.ok) {
                  const d = await r.json();
                  const raw = d?.random_numbers ?? d?.data ?? d?.numbers ?? d?.blocks;
                  const parsed = Array.isArray(raw)
                    ? raw.map(v => (typeof v === 'object' && v !== null ? Number(v.decimal ?? v.value) : Number(v)))
                    : null;
                  if (parsed && parsed.length && !parsed.some(Number.isNaN)) { numbers = parsed; poolSource = 'outshift'; }
                }
              } catch (e) { out.source = 'outshift_' + (e.name === 'TimeoutError' ? 'timeout' : e.message); }
            }

            // Source 2 : ANU, tentée si Outshift a échoué (ou n'est pas configuré)
            if (!numbers) {
              try {
                if (process.env.ANU_QRNG_API_KEY) {
                  const r = await fetch(`https://api.quantumnumbers.anu.edu.au?length=${BATCH}&type=uint8`, {
                    headers: { 'x-api-key': process.env.ANU_QRNG_API_KEY, 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(8000)
                  });
                  out.source = r.status;
                  if (r.ok) { const d = await r.json(); if (Array.isArray(d.data)) { numbers = d.data; poolSource = 'anu'; } }
                } else { out.source = 'missing_api_key'; }
              } catch (e) { out.source = e.name === 'TimeoutError' ? 'timeout' : e.message; }
            }

            if (numbers && numbers.length) {
              const batchId = 'batch_' + Date.now().toString(36);
              const batchHash = crypto.createHash('sha256').update(Buffer.from(numbers)).digest('hex');
              const committedAt = new Date().toISOString();
              const rows = numbers.map(v => ({ batch_id: batchId, batch_hash: batchHash, committed_at: committedAt, byte_value: v, bit_value: v >= 128 ? 1 : 0, qrng_source: poolSource }));
              for (let i = 0; i < rows.length; i += 500) { await sb.from('retro_pool').insert(rows.slice(i, i + 500)); }
              out.filled = rows.length;
            }
          }

          // (2) Résolution des "futurs" : chaque session sans future_bit reçoit le plus
          //     ancien octet du pool scellé APRÈS son intention (donc un vrai "futur").
          const { data: pend } = await sb.from('retro_sessions')
            .select('id, intention_at').is('future_bit', null).neq('status', 'excluded')
            .order('intention_at', { ascending: true }).limit(500);
          for (const s of (pend || [])) {
            const { data: fb } = await sb.from('retro_pool')
              .select('id, bit_value, committed_at, batch_hash')
              .is('consumed_at', null).gt('committed_at', s.intention_at)
              .order('committed_at', { ascending: true }).limit(1);
            if (fb && fb[0]) {
              const b = fb[0];
              await sb.from('retro_pool').update({ consumed_at: new Date().toISOString(), consumed_role: 'future', consumed_session: String(s.id) }).eq('id', b.id);
              await sb.from('retro_sessions').update({ future_bit: b.bit_value, future_committed_at: b.committed_at, future_commit_hash: b.batch_hash, future_resolved_at: new Date().toISOString() }).eq('id', s.id);
              out.resolved++;
            }
          }
          return res.status(200).json({ success: true, ...out });
        } catch (e) {
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
          // Frais Stripe réels du mois (balance transactions), pas une estimation par taux :
          // le taux dépend de la carte du client et Stripe prélève aussi des frais hors
          // encaissement. Repli sur l'estimation seulement si l'API est injoignable.
          // Construit à partir des composantes date, pas d'un toISOString() : sur un serveur
          // décalé par rapport à UTC, new Date(y, m, 1).toISOString() bascule sur le mois
          // précédent et on irait chercher le mauvais relevé Stripe.
          const monthRef = new Date(now.getFullYear(), now.getMonth() + offset, 1);
          const monthKey = `${monthRef.getFullYear()}-${String(monthRef.getMonth() + 1).padStart(2, '0')}`;
          const feesResult = await getMonthlyStripeFees(supabase, monthKey, { forceRefresh: testCurrentMonth });
          const STRIPE_SOURCES = ['precommande', 'abonnement', 'don', 'guidance'];
          const stripeRows = recetteRows.filter(t => STRIPE_SOURCES.includes(t.source));
          const feesAreReal = feesResult.ok;
          const stripeFees = feesAreReal
            ? feesResult.feesEur
            : estimateStripeFees(stripeRows.reduce((s,t) => s + parseFloat(t.amount), 0), stripeRows.length);
          const feesLabel = feesAreReal
            ? `Frais Stripe réels (relevé Stripe${feesResult.chargeCount ? `, ${feesResult.chargeCount} paiement${feesResult.chargeCount > 1 ? 's' : ''}` : ''})`
            : `Frais Stripe estimés (${(ESTIMATE_RATE*100).toLocaleString('fr-FR')}% + ${ESTIMATE_FIXED_EUR.toFixed(2).replace('.',',')}€/transaction)`;
          const feesNote = feesAreReal
            ? ''
            : `<p style="margin:6px 0 0;color:#f87171;font-size:11.5px;font-style:italic;">⚠️ Relevé Stripe indisponible (${feesResult.error}) — chiffre estimé, à revérifier.</p>`;
          // Ce qui reste vraiment en caisse : les cotisations URSSAF sont un décaissement
          // au même titre que les frais Stripe, les ignorer donnait un « net » trop flatteur.
          const tresorerieReelle = totalRecettes - stripeFees - totalDepenses - urssaf;
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
          const feeLine = (label, value) => `<tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">${label}</td><td style="text-align:right;color:#f87171;">− ${fmt(value)}</td></tr>`;
          const stripeDetailRows = feesAreReal
            ? feeLine('Commissions sur encaissements', feesResult.processingFeesEur)
              + (feesResult.otherFeesEur > 0 ? feeLine('Autres frais Stripe (Billing, litiges, change)', feesResult.otherFeesEur) : '')
              + (feesResult.refundCount > 0 ? `<tr><td style="padding:4px 0;color:rgba(209,201,176,0.6);font-size:12px;font-style:italic;" colspan="2">${feesResult.refundCount} remboursement${feesResult.refundCount>1?'s':''} sur la période (les commissions Stripe ne sont pas restituées)</td></tr>` : '')
            : feeLine(`Estimation sur ${stripeRows.length} encaissement${stripeRows.length > 1 ? 's' : ''}`, stripeFees);
          const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#050a14;font-family:Georgia,serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#050a14;padding:40px 20px;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a1628;border:1px solid rgba(212,175,55,0.25);border-radius:6px;"><tr><td style="padding:40px 40px 24px;border-bottom:1px solid rgba(212,175,55,0.1);"><p style="margin:0 0 4px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.4em;text-transform:uppercase;">Rapport mensuel</p><h1 style="margin:0;color:#f0c75e;font-size:26px;font-weight:300;">ORADIA — ${cap(monthLabel)}</h1></td></tr><tr><td style="padding:32px 40px;"><p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;">Comptabilité</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.05);border-radius:4px;margin-bottom:28px;"><tr><td style="padding:12px;"><table width="100%">${catRows||'<tr><td style="padding:6px;color:#d1c9b0;">Aucune transaction ce mois</td></tr>'}</table></td></tr><tr><td style="padding:4px 12px;border-top:1px solid rgba(212,175,55,0.1);"><table width="100%"><tr><td style="padding:8px 0;color:#d1c9b0;font-size:13px;">Recettes encaissées (brut)</td><td style="text-align:right;color:#4ade80;font-weight:700;">${fmt(totalRecettes)}</td></tr><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">${feesLabel}</td><td style="text-align:right;color:#f87171;">− ${fmt(stripeFees)}</td></tr><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">Dépenses</td><td style="text-align:right;color:#f87171;">− ${fmt(totalDepenses)}</td></tr><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">Cotisations URSSAF estimées</td><td style="text-align:right;color:#f87171;">− ${fmt(urssaf)}</td></tr><tr><td style="padding:10px 0 4px;color:#f0c75e;font-size:14px;font-weight:600;border-top:1px solid rgba(212,175,55,0.15);">Résultat net — ce qu'il vous reste</td><td style="text-align:right;color:${tresorerieReelle>=0?'#2dd4bf':'#f87171'};font-weight:700;font-size:16px;border-top:1px solid rgba(212,175,55,0.15);">${fmt(tresorerieReelle)}</td></tr></table></td></tr></table><p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;">URSSAF (micro-entrepreneur)</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.05);border-radius:4px;margin-bottom:28px;"><tr><td style="padding:16px 12px;"><table width="100%"><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">BIC 12,3% sur ${fmt(recBIC)}</td><td style="text-align:right;color:#e8c96a;">${fmt(recBIC*0.123)}</td></tr><tr><td style="padding:4px 0;color:#d1c9b0;font-size:13px;">BNC 21,1% sur ${fmt(recBNC)}</td><td style="text-align:right;color:#e8c96a;">${fmt(recBNC*0.211)}</td></tr><tr><td style="padding:8px 0 4px;color:#f0c75e;font-size:14px;font-weight:600;border-top:1px solid rgba(212,175,55,0.15);">Total cotisations estimées</td><td style="text-align:right;color:#f0c75e;font-weight:700;font-size:16px;border-top:1px solid rgba(212,175,55,0.15);">${fmt(urssaf)}</td></tr></table></td></tr></table><div style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.25);border-radius:4px;padding:14px 16px;margin-bottom:28px;"><p style="margin:0 0 6px;color:#f87171;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">⚠️ Ce que vous devez déclarer à l'URSSAF</p><p style="margin:0 0 8px;color:#d1c9b0;font-size:12.5px;line-height:1.6;">Le montant brut encaissé par le client — <strong>pas</strong> le net après commission Stripe. Les frais Stripe ne sont pas déductibles en micro-entreprise (l'abattement forfaitaire joue déjà ce rôle au moment de l'impôt sur le revenu).</p><p style="margin:0;color:#e8c96a;font-size:13px;font-weight:600;">Montant à déclarer ce mois-ci : ${fmt(totalRecettes)} — et non ${fmt(totalRecettes - stripeFees)}, qui est le net une fois Stripe passé.</p></div><p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;">Détail des frais Stripe</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.05);border-radius:4px;margin-bottom:28px;"><tr><td style="padding:16px 12px;"><table width="100%">${stripeDetailRows}<tr><td style="padding:8px 0 4px;color:#f0c75e;font-size:14px;font-weight:600;border-top:1px solid rgba(212,175,55,0.15);">Total prélevé par Stripe</td><td style="text-align:right;color:#f87171;font-weight:700;font-size:16px;border-top:1px solid rgba(212,175,55,0.15);">− ${fmt(stripeFees)}</td></tr></table>${feesNote}</td></tr></table><p style="margin:0 0 12px;color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;">Activité du site</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.05);border-radius:4px;margin-bottom:28px;"><tr><td style="padding:16px 12px;"><table width="100%"><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Pages vues</td><td style="text-align:right;color:#2dd4bf;font-weight:600;">${totalViews}</td></tr><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Visiteurs uniques</td><td style="text-align:right;color:#2dd4bf;font-weight:600;">${uniqueVisitors}</td></tr><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Abonnés Tore actifs</td><td style="text-align:right;color:#f0c75e;font-weight:600;">${activeSubs||0}</td></tr><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Nouveaux contacts</td><td style="text-align:right;color:#f0c75e;font-weight:600;">+${newContacts||0}</td></tr><tr><td style="padding:3px 0;color:#d1c9b0;font-size:13px;">Erreurs techniques</td><td style="text-align:right;color:${(errors||0)>0?'#f87171':'#4ade80'};font-weight:600;">${errors||0}</td></tr></table></td></tr></table><p style="margin:0;color:rgba(212,175,55,0.3);font-size:11px;text-align:center;font-style:italic;">Rapport automatique · oradia.fr/admin</p></td></tr></table></td></tr></table></body></html>`;
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

      // ── Réparer l'accès d'un abonné (compte Supabase Auth manquant ou cassé) ──
      // Cas typique : un paiement Stripe a bien abouti mais le webhook n'a jamais
      // créé le compte membre (ou l'a créé avec un mot de passe qui n'a pas pu être
      // communiqué au client). On ne touche pas à l'abonnement lui-même (déjà actif
      // dans tore_subscriptions, sinon il ne serait pas listé ici) — on répare
      // uniquement l'accès au compte :
      //   - le compte Supabase Auth n'existe pas encore → on le crée avec un mot de
      //     passe provisoire (comme au premier abonnement) et on l'envoie par email
      //   - le compte existe déjà → on génère un lien de réinitialisation à usage
      //     unique (jamais de mot de passe en clair pour un compte qui existe déjà,
      //     on ne peut pas savoir si le mot de passe qu'on enverrait serait le bon)
      if (action === 'repair-access' && subscriptionId) {
        const { data: sub, error: subFetchError } = await supabase
          .from('tore_subscriptions')
          .select('email, full_name, plan')
          .eq('id', subscriptionId)
          .single();
        if (subFetchError || !sub?.email) {
          return res.status(404).json({ error: 'Abonnement introuvable' });
        }

        const cleanEmail = sub.email.toLowerCase().trim();
        let tempPassword = null;
        let resetLink = null;
        let mode = null;

        // On tente d'abord un lien de récupération : s'il réussit, le compte existe déjà.
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: cleanEmail,
          options: { redirectTo: 'https://oradia.fr/member/reset-password.html' }
        });

        if (!linkErr && linkData?.properties?.action_link) {
          resetLink = linkData.properties.action_link;
          mode = 'reset-link';
        } else {
          // Le compte n'existe probablement pas encore : on le crée avec un mot de
          // passe provisoire, à changer obligatoirement à la 1ère connexion.
          tempPassword = crypto.randomBytes(8).toString('hex');
          const { error: createErr } = await supabase.auth.admin.createUser({
            email: cleanEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              full_name: sub.full_name || '',
              subscription_type: 'tore',
              subscription_active: true,
              must_change_password: true
            }
          });
          if (createErr) {
            console.error('[repair-access] createUser error:', createErr.message);
            return res.status(500).json({ error: `Impossible de créer ou récupérer le compte : ${createErr.message}` });
          }
          mode = 'temp-password';
        }

        // Séparé (colonne ajoutée par une migration facultative) : si absente, ne bloque
        // pas la réparation d'accès, juste l'indicateur dashboard reste inactif.
        if (mode === 'temp-password') {
          const { error: mcpErr } = await supabase
            .from('tore_subscriptions')
            .update({ must_change_password: true })
            .eq('id', subscriptionId);
          if (mcpErr) console.error('[repair-access] must_change_password update (migration appliquée ?):', mcpErr.message);
        }

        const emailSent = await sendToreSubscriptionEmail({
          toEmail: cleanEmail,
          toName: sub.full_name || '',
          tempPassword,
          resetLink,
          plan: sub.plan || 'complet'
        });

        return res.status(200).json({ success: true, emailSent, mode });
      }

      // Renvoi manuel du mail de check-in "vous n'avez pas fait de tirage" pour UN abonné
      // (bouton dédié dans l'onglet Abonnements). force=true : envoie même si déjà notifié
      // ou même si un tirage a depuis été détecté — décision volontaire de l'admin.
      if (action === 'send-checkin-email' && subscriptionId) {
        try {
          const r = await sendToreCheckinForSubscription(supabase, subscriptionId, { force: true });
          if (!r.sent) return res.status(502).json({ error: `Envoi échoué (${r.reason})` });
          return res.status(200).json({ success: true, ...r });
        } catch (e) {
          return res.status(500).json({ error: e.message });
        }
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

        // Changement d'adresse email : validation + déplacement dans Brevo (liste 5)
        let oldEmail = null;
        if (body.email !== undefined) {
          const newEmail = (body.email || '').trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            return res.status(400).json({ error: 'Adresse email invalide' });
          }
          const { data: cur } = await supabase
            .from('newsletter_contacts').select('email').eq('id', id).maybeSingle();
          if (cur && cur.email && newEmail !== cur.email.toLowerCase()) {
            // Refuser si l'email est déjà utilisé par un autre contact
            const { data: dup } = await supabase
              .from('newsletter_contacts').select('id').eq('email', newEmail).neq('id', id).limit(1);
            if (Array.isArray(dup) && dup.length > 0) {
              return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre contact' });
            }
            updates.email = newEmail;
            oldEmail = cur.email;
          }
        }

        const { data, error } = await supabase
          .from('newsletter_contacts')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        if (error) {
          if (error.code === '23505') return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre contact' });
          throw error;
        }

        // Déplacement Brevo si l'email a changé : on retire l'ancien de la liste 5,
        // puis on (re)synchronise le nouveau selon son statut/catégorie.
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (oldEmail && BREVO_API_KEY) {
          try {
            await fetch('https://api.brevo.com/v3/contacts/lists/5/contacts/remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
              body: JSON.stringify({ emails: [oldEmail] })
            });
          } catch (_) {}
        }
        if (oldEmail || updates.tags !== undefined) {
          await syncContactToBrevo(supabase, BREVO_API_KEY, data);
        }
        return res.status(200).json({ success: true, emailChanged: !!oldEmail });
      }

      // ── Contacts newsletter : désinscription manuelle (garde le contact, le retire de la liste 5) ──
      if (action === 'unsubscribe-contact') {
        const { id, email } = body;
        if (!id && !email) return res.status(400).json({ error: 'id ou email requis' });

        let q = supabase.from('newsletter_contacts').select('id, email, tags');
        q = id ? q.eq('id', id) : q.eq('email', (email || '').toLowerCase().trim());
        const { data: contact, error: fetchErr } = await q.maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

        // Retire la catégorie "general" (elle est ce qui déclenche l'appartenance à la liste 5)
        const newTags = (contact.tags || []).filter(t => t !== 'general');

        const { error: updErr } = await supabase
          .from('newsletter_contacts')
          .update({
            status: 'unsubscribed',
            brevo_synced: false,
            unsubscribed_at: new Date().toISOString(),
            tags: newTags
          })
          .eq('id', contact.id);
        if (updErr) throw updErr;

        // Désinscription réelle dans Brevo : blacklist (emailBlacklisted:true) ET retrait
        // de la liste 5. Ce qui compte à l'envoi, c'est l'appartenance à la liste 5 (les
        // campagnes ciblent listIds:[5]). On vérifie donc EXPLICITEMENT les deux appels.
        let brevoRemoved = false;
        let blacklistStatus = null, blacklistBody = '';
        let listStatus = null, listBody = '';
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (contact.email && BREVO_API_KEY) {
          // 1) Blacklist
          try {
            const rb = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(contact.email)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
              body: JSON.stringify({ emailBlacklisted: true })
            });
            blacklistStatus = rb.status;
            if (!(rb.ok || rb.status === 204)) blacklistBody = (await rb.text().catch(() => '')).slice(0, 300);
          } catch (e) { blacklistStatus = 'exception'; blacklistBody = e.message; }
          // 2) Retrait de la liste 5
          try {
            const rl = await fetch('https://api.brevo.com/v3/contacts/lists/5/contacts/remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
              body: JSON.stringify({ emails: [contact.email] })
            });
            listStatus = rl.status;
            listBody = (await rl.text().catch(() => '')).slice(0, 300);
          } catch (e) { listStatus = 'exception'; listBody = e.message; }

          // Succès si le blacklist a pris (204/OK ou 404 = déjà absent) OU si le retrait a réussi.
          const blOk = blacklistStatus === 204 || blacklistStatus === 200 || blacklistStatus === 404;
          const listOk = listStatus === 201 || listStatus === 204 || listStatus === 200;
          brevoRemoved = blOk || listOk;
        }
        const brevoDetail = BREVO_API_KEY
          ? `blacklist=${blacklistStatus}${blacklistBody ? '('+blacklistBody+')' : ''} · liste5-remove=${listStatus}${listBody ? '('+listBody+')' : ''}`
          : 'BREVO_API_KEY absente côté serveur';
        await logSystemEvent(supabase, { level: brevoRemoved ? 'info' : 'error', source: 'unsubscribe-contact', method: 'POST', path: '/api/admin/data', status_code: 200, message: `Désinscription ${contact.email} — ${brevoRemoved ? 'OK' : 'ÉCHEC Brevo'}`, details: { brevoDetail } });

        return res.status(200).json({ success: true, brevoRemoved, brevoDetail });
      }

      // ── Contacts newsletter : réinscription (annule un blacklist Brevo / statut unsubscribed) ──
      if (action === 'resubscribe-contact') {
        const { id, email } = body;
        if (!id && !email) return res.status(400).json({ error: 'id ou email requis' });

        let q = supabase.from('newsletter_contacts').select('id, email, tags');
        q = id ? q.eq('id', id) : q.eq('email', (email || '').toLowerCase().trim());
        const { data: contact, error: fetchErr } = await q.maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

        // Remet la catégorie "general" si absente (c'est elle qui déclenche l'appartenance à la liste 5)
        const newTags = (contact.tags || []).includes('general') ? contact.tags : [...(contact.tags || []), 'general'];

        // Réinscription réelle dans Brevo : retire le blacklist ET rajoute à la liste 5.
        let brevoRestored = false;
        let unblacklistStatus = null, unblacklistBody = '';
        let listStatus = null, listBody = '';
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (contact.email && BREVO_API_KEY) {
          // 1) Retrait du blacklist
          try {
            const rb = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(contact.email)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
              body: JSON.stringify({ emailBlacklisted: false })
            });
            unblacklistStatus = rb.status;
            if (!(rb.ok || rb.status === 204)) unblacklistBody = (await rb.text().catch(() => '')).slice(0, 300);
          } catch (e) { unblacklistStatus = 'exception'; unblacklistBody = e.message; }
          // 2) Ajout à la liste 5 (crée le contact dans Brevo si besoin)
          try {
            const rl = await fetch('https://api.brevo.com/v3/contacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
              body: JSON.stringify({ email: contact.email, listIds: [5], updateEnabled: true })
            });
            listStatus = rl.status;
            if (!(rl.ok || rl.status === 204)) listBody = (await rl.text().catch(() => '')).slice(0, 300);
          } catch (e) { listStatus = 'exception'; listBody = e.message; }

          const unblOk = unblacklistStatus === 204 || unblacklistStatus === 200;
          const listOk = listStatus === 201 || listStatus === 204 || listStatus === 200;
          brevoRestored = unblOk && listOk;
        }
        const brevoDetail = BREVO_API_KEY
          ? `unblacklist=${unblacklistStatus}${unblacklistBody ? '('+unblacklistBody+')' : ''} · liste5-add=${listStatus}${listBody ? '('+listBody+')' : ''}`
          : 'BREVO_API_KEY absente côté serveur';

        // Ne marque "active"/"brevo_synced" côté Supabase que si Brevo a bien confirmé,
        // pour ne jamais afficher un statut local qui ne reflète pas la réalité Brevo.
        if (brevoRestored || !BREVO_API_KEY) {
          const { error: updErr } = await supabase
            .from('newsletter_contacts')
            .update({ status: 'active', brevo_synced: true, unsubscribed_at: null, tags: newTags })
            .eq('id', contact.id);
          if (updErr) throw updErr;
        }

        await logSystemEvent(supabase, { level: brevoRestored ? 'info' : 'error', source: 'resubscribe-contact', method: 'POST', path: '/api/admin/data', status_code: 200, message: `Réinscription ${contact.email} — ${brevoRestored ? 'OK' : 'ÉCHEC Brevo'}`, details: { brevoDetail } });

        return res.status(200).json({ success: true, brevoRestored, brevoDetail });
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
        // Rappel de renouvellement (~3 jours avant échéance) : template dédié
        if (type === 'renewal-reminder') {
          const sample = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          const ok = await sendRenewalReminderEmail(toEmail, sample);
          if (!ok) return res.status(502).json({ error: 'Envoi Brevo échoué' });
          return res.status(200).json({ success: true, email: toEmail, type });
        }
        // Réutilise le VRAI template (lib/tore-subscription-email.js), partagé avec le
        // webhook Stripe — avant ce correctif, ce test envoyait une copie figée du
        // template, qui divergeait au fil des évolutions du vrai email envoyé aux abonnés.
        // type attendu ici : 'payment_failed' ou 'expired' (mappé sur 'cancelled').
        const emailSentSub = await sendSubscriptionEmail(toEmail, body.name || '', type === 'payment_failed' ? 'payment_failed' : 'cancelled');
        if (!emailSentSub) return res.status(502).json({ error: 'Envoi Brevo échoué' });
        return res.status(200).json({ success: true, email: toEmail, type });
      }

      if (action === 'test-email') {
        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configuré' });
        const type = body.type || '';
        const dest = 'contact@oradia.fr';
        const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr';

        // "Confirmation abonnement Tore" : réutilise le VRAI template envoyé aux abonnés
        // (lib/tore-subscription-email.js), avec des données d'exemple. Avant ce correctif,
        // ce bouton envoyait une copie figée et obsolète du template, sans rapport avec ce
        // que les abonnés reçoivent réellement — corrigé pour que le test reflète la réalité.
        if (type === 'tore-payment') {
          const emailSent = await sendToreSubscriptionEmail({
            toEmail: dest,
            toName: 'Prénom Nom (exemple)',
            tempPassword: body.mode === 'existing' ? null : 'ExempleMdp123',
            plan: body.plan === 'decouverte' ? 'decouverte' : 'complet'
          });
          if (!emailSent) return res.status(502).json({ error: 'Envoi Brevo échoué' });
          return res.status(200).json({ success: true, sentTo: dest, type });
        }

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
          // Réutilise le VRAI template (api/waitlist.js), au lieu d'une copie générique
          // qui ne reflétait plus l'email réellement envoyé (bandeau, encart précommande, etc.)
          const emailSentNl = await sendWaitlistConfirmationEmail(dest);
          if (!emailSentNl) return res.status(502).json({ error: 'Envoi Brevo échoué' });
          return res.status(200).json({ success: true, sentTo: dest, type });
        } else if (type === 'preorder-confirm') {
          // Réutilise le VRAI template (lib/brevo-order-email.js), partagé avec le webhook
          // Stripe — avant ce correctif, ce test envoyait une copie générique sans rapport
          // avec l'email réellement reçu après une précommande.
          const emailSentPre = await sendBrevoEmail({
            toEmail: dest,
            toName: 'Prénom Nom (exemple)',
            offer: 'Standard - Oracle Oradia',
            amountTotal: '38.00'
          });
          if (!emailSentPre) return res.status(502).json({ error: 'Envoi Brevo échoué' });
          return res.status(200).json({ success: true, sentTo: dest, type });
        } else if (type === 'guidance-confirm') {
          // Réutilise le VRAI template (lib/guidance-email.js), partagé avec le webhook
          // Cal.com — avant ce correctif, ce test envoyait une copie générique sans le
          // lien Jitsi, la date, ni la mise en page réelle.
          const sampleDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          const emailSentGuidance = await sendGuidanceConfirmationEmail({
            clientEmail: dest,
            clientName: 'Prénom Nom (exemple)',
            duration: 60,
            dateStr: sampleDate.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' }),
            jitsiUrl: 'https://meet.jit.si/oradia-exemple'
          });
          if (!emailSentGuidance) return res.status(502).json({ error: 'Envoi Brevo échoué' });
          return res.status(200).json({ success: true, sentTo: dest, type });
        } else if (type === 'tore-checkin') {
          // body.mode === 'changed' → mot de passe déjà changé (pas de rappel de connexion).
          // Par défaut → mot de passe encore provisoire (avec rappel de connexion + mdp).
          const emailSentCheckin = await sendToreCheckinReminderEmail({
            toEmail: dest,
            toName: 'Prénom Nom (exemple)',
            tempPassword: body.mode === 'changed' ? null : 'ExempleMdp123'
          });
          if (!emailSentCheckin) return res.status(502).json({ error: 'Envoi Brevo échoué' });
          return res.status(200).json({ success: true, sentTo: dest, type });
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

      // Détecte si le code promo (5€ le 1er mois) a été appliqué, combien a été
      // payé au 1er prélèvement, et le total encaissé sur cet abonnement — le tout
      // à partir des mêmes factures Stripe (un seul appel par abonné). La remise
      // "once" disparaît de subscription.discount après le 1er mois : on regarde
      // donc la facture elle-même, qui garde la preuve pour toujours. Plafonné et
      // parallélisé pour ne jamais ralentir la page ; dégrade en "inconnu" (null)
      // si Stripe ne répond pas.
      const PROMO_CHECK_CAP = 100;
      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          const toCheck = rows.filter(r => r.stripe_subscription_id).slice(0, PROMO_CHECK_CAP);
          await Promise.all(toCheck.map(async (r) => {
            try {
              const invoices = await stripe.invoices.list({ subscription: r.stripe_subscription_id, limit: 100 });
              if (!invoices.data.length) { r.promo_applied = null; return; }
              const first = invoices.data.reduce((a, b) => (a.created < b.created ? a : b));
              r.promo_applied = !!(first.discount) || !!(first.total_discount_amounts && first.total_discount_amounts.length);
              r.first_payment_eur = Math.round((first.amount_paid || 0)) / 100;
              r.total_paid_eur = Math.round(invoices.data.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0)) / 100;
            } catch (_) { r.promo_applied = null; }
          }));
        } catch (_) { /* Stripe indisponible : les colonnes Promo/Payé afficheront juste "?" */ }
      }

      // "Dernier tirage" réel, calculé depuis la table tirages (via la même RPC que
      // "Voir les tirages"), pour TOUS les abonnés — payants ET gratuits. Le champ
      // last_draw_date de tore_subscriptions n'est renseigné que pour le plan
      // "découverte" (limite 1/jour) et reste vide pour tous les autres, donnant
      // l'impression à tort qu'ils n'ont jamais tiré. Plafonné et parallélisé.
      const DRAW_CHECK_CAP = 100;
      const drawTargets = rows.filter(r => r.email).slice(0, DRAW_CHECK_CAP);
      await Promise.all(drawTargets.map(async (r) => {
        try {
          const { data: tirages, error: tErr } = await supabase.rpc('admin_get_tirages_by_email', { p_email: r.email });
          if (tErr) { r.real_last_draw_debug = `rpc_error: ${tErr.message}`; return; }
          if (Array.isArray(tirages) && tirages.length) {
            const latest = tirages.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b));
            r.real_last_draw = latest.created_at;
          } else {
            r.real_last_draw_debug = 'rpc_ok_mais_zero_tirage';
          }
        } catch (e) { r.real_last_draw_debug = `exception: ${e.message}`; }
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

      // Fenêtres d'observation activées ce mois-ci → proxy du nombre d'appels QRNG
      // (sources quantiques vérifiées : ANU ou Outshift/Cisco).
      let qrngAnu = 0, qrngFallback = 0;
      {
        const { data: obsRows, error } = await supabase
          .from('observation_windows')
          .select('qrng_source')
          .gte('created_at', startOfMonth);
        if (!error) {
          qrngAnu = (obsRows || []).filter(r => QUANTUM_SOURCES.includes(r.qrng_source)).length;
          qrngFallback = (obsRows || []).filter(r => r.qrng_source && !QUANTUM_SOURCES.includes(r.qrng_source)).length;
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

      // État des sources quantiques (ANU + Outshift) : lecture des derniers appels loggés
      // par /api/qrng.js (table qrng_usage), sans jamais consommer de quota nous-mêmes
      // (aucun appel actif aux API quantiques depuis le dashboard).
      let anuHealth = null;
      try {
        const anuKeyConfigured = !!process.env.ANU_QRNG_API_KEY;
        const outshiftKeyConfigured = !!process.env.OUTSHIFT_QRNG_API_KEY;
        const keyConfigured = anuKeyConfigured || outshiftKeyConfigured;
        const now = Date.now();
        const since24h = new Date(now - 24 * 3600 * 1000).toISOString();
        const since7d = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

        const { data: recentRows } = await supabase
          .from('qrng_usage')
          .select('outcome, status_code, reason, created_at')
          .gte('created_at', since7d)
          .order('created_at', { ascending: false })
          .limit(500);

        const rows7d = recentRows || [];
        const rows24h = rows7d.filter(r => r.created_at >= since24h);
        const count = (rows, outcome) => rows.filter(r => r.outcome === outcome).length;
        const countQuantum = (rows) => rows.filter(r => QUANTUM_SOURCES.includes(r.outcome)).length;
        const mostRecent = rows7d[0] || null;

        let status;
        if (!keyConfigured) status = 'no_key';
        else if (rows24h.length === 0 && rows7d.length === 0) status = 'unknown';
        else if (rows24h.length > 0 && countQuantum(rows24h) === 0 && count(rows24h, 'fallback') > 0) status = 'down';
        else if (rows24h.length > 0 && count(rows24h, 'fallback') > 0) status = 'degraded';
        else if (rows24h.length > 0 && countQuantum(rows24h) > 0) status = 'ok';
        else status = 'unknown'; // aucun tirage dans les 24h mais un historique 7j existe

        // Statut individuel par source : configurée + dernier succès observé dans qrng_usage.
        const sourceStatus = (key, envConfigured) => {
          const last24 = count(rows24h, key);
          const last7 = count(rows7d, key);
          const lastRow = rows7d.find(r => r.outcome === key) || null; // rows7d trié desc par created_at
          let st;
          if (!envConfigured) st = 'no_key';
          else if (last24 > 0) st = 'ok';
          else if (rows7d.length === 0) st = 'unknown';
          else st = 'down'; // clé configurée, appels récents existants, mais aucun succès sur cette source en 24h
          return { status: st, keyConfigured: envConfigured, last24h: last24, last7d: last7, lastSuccessAt: lastRow?.created_at || null };
        };

        anuHealth = {
          status,
          keyConfigured,
          anuKeyConfigured,
          outshiftKeyConfigured,
          sources: {
            anu: sourceStatus('anu', anuKeyConfigured),
            outshift: sourceStatus('outshift', outshiftKeyConfigured),
          },
          last24h: { anu: count(rows24h, 'anu'), outshift: count(rows24h, 'outshift'), fallback: count(rows24h, 'fallback'), total: rows24h.length },
          last7d:  { anu: count(rows7d, 'anu'),  outshift: count(rows7d, 'outshift'),  fallback: count(rows7d, 'fallback'),  total: rows7d.length },
          mostRecent
        };
      } catch (e) {
        anuHealth = { status: 'unknown', error: e.message };
      }

      return res.status(200).json({
        success: true,
        data: {
          audits: auditRows || [],
          uptime,
          anuHealth
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
      // Seules les sources quantiques vérifiées (ANU, Outshift) sont valides pour l'étude.
      const qrngBreakdown = {
        anu:      rows.filter(r => r.qrng_source === 'anu').length,
        outshift: rows.filter(r => r.qrng_source === 'outshift').length,
        fallback: rows.filter(r => r.qrng_source === 'fallback').length,
        unknown:  rows.filter(r => !r.qrng_source || r.qrng_source === 'unknown').length,
        migrationPending: qrngMissing  // avertit le dashboard
      };
      // VALIDITÉ SCIENTIFIQUE : toutes les statistiques ci-dessous sont calculées
      // UNIQUEMENT sur les tirages 100% quantiques (ANU ou Outshift). Les réponses
      // 'fallback' et 'unknown' sont exclues car elles ne sont pas valides pour l'étude.
      // qrngBreakdown (ci-dessus) conserve le décompte complet pour la bannière.
      const anuRows = rows.filter(r => QUANTUM_SOURCES.includes(r.qrng_source));

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
    // Part "livraison" des précommandes payées : cette somme est fléchée vers l'affranchissement,
    // pas disponible pour financer la fabrication — on la retire pour obtenir la vraie cagnotte.
    const preordersShippingTotal = paidPreorderRows.reduce((s, r) => s + ((parseInt(r.shipping_price_cents, 10) || 0) / 100), 0);
    const donorsTotal     = sumDonors(donorRows);
    const globalTotal     = preordersTotal + donorsTotal + singleDrawTotal + guidancesTotal + subscriptionsTotal;
    const totalContacts   = paidPreorderRows.length + donorRows.length + waitlistRows.length;
    const averageBasket   = paidPreorderRows.length > 0 ? preordersTotal / paidPreorderRows.length : 0;

    // Estimation partagée (lib/stripe-fees.js) — ces compteurs portent sur des fenêtres
    // glissantes (jour / 7j / 30j) qui ne correspondent à aucun relevé Stripe mensuel.
    // Les chiffres comptables du rapport mensuel et de l'onglet Comptabilité, eux,
    // utilisent les frais réels lus dans les balance transactions.
    const stripeFee     = (total, count) => estimateStripeFees(total, count);
    const preordersNet  = preordersTotal  - stripeFee(preordersTotal,  paidPreorderRows.length);
    // Cagnotte réellement disponible pour lancer la fabrication : net de frais Stripe
    // ET hors part livraison (qui doit repartir en frais de port, pas financer la fabrication).
    const preordersCagnotteFabrication = Math.max(0, preordersNet - preordersShippingTotal);
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
          shippingTotal:          preordersShippingTotal,
          cagnotteFabrication:    preordersCagnotteFabrication,
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
// (fond sombre uni + carte), bandeau rappel abonnement en tête.
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

  // L'image de fond reste sur la table extérieure — elle habille les marges de chaque côté
  // de la carte. C'est la carte elle-même qui devait changer : elle reposait sur un dégradé
  // semi-transparent (rgba), or ni Gmail (web et mobile) ni Outlook ne gèrent les dégradés
  // CSS sur une <table>. Le conteneur restait donc transparent et, dès que le destinataire
  // chargeait les images — ou transférait le message —, la photo remontait derrière le texte,
  // qui devenait illisible. La carte a maintenant un fond opaque, porté à la fois par
  // l'attribut bgcolor (Outlook) et par background-color : l'image ne peut plus la traverser.
  // Les liens Google Fonts sont retirés au passage : aucun client mail ne charge de feuille
  // de style externe, et ces requêtes distantes pèsent dans le score anti-spam.
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0; padding:0; background-color:#040d1c;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#040d1c" background="https://oradia.fr/images/oradia-hero-4k.webp" style="background-color:#040d1c; background-image:url('https://oradia.fr/images/oradia-hero-4k.webp'); background-size:cover; background-position:center; background-repeat:no-repeat;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a192f" style="background-color:#0a192f; max-width:700px; margin:0 auto; border-radius:16px; overflow:hidden; border:1px solid rgba(212,175,55,0.18); box-shadow:0 10px 40px rgba(0,0,0,0.4);">
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
    <p style="margin:0 0 14px;"><a href="https://oradia.fr" style="color:#d4af37; text-decoration:none; font-size:13px; letter-spacing:0.08em; font-family:Georgia,serif;">oradia.fr</a></p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.png" alt="Facebook" width="36" height="36" style="display:block;width:36px;height:36px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.png" alt="Instagram" width="36" height="36" style="display:block;width:36px;height:36px;border:0;"></a></td></tr></table>
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

// Les liens insérés dans l'éditeur du dashboard doivent survivre jusqu'à l'email.
// Le filtre de balises ne garde que <a> sans ses attributs : on réinjecte ici le href
// (validé : http, https, mailto ou chemin absolu du site) et le style, car aucun client
// mail n'applique de feuille de style externe — un <a> nu s'afficherait en bleu souligné
// par défaut, illisible sur le fond sombre.
function nlStyleLinks(html) {
  return String(html).replace(/<a\b([^>]*)>/gi, (_tag, attrs) => {
    const m = String(attrs).match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = (m ? (m[1] ?? m[2] ?? m[3] ?? '') : '').replace(/&amp;/g, '&').trim();
    if (!/^(?:https?:\/\/|mailto:|\/)/i.test(href)) return ''; // javascript:, data:, ancre… : lien retiré, texte conservé
    const url = href.startsWith('/') ? nlAbsUrl(href) : href;
    return `<a href="${nlEscHtml(url)}" target="_blank" style="color:#d4af37; text-decoration:underline;">`;
  });
}

// Le webmail Hotmail / Outlook.com a un comportement différent du reste (y compris
// d'Outlook de bureau) : il ignore bgcolor et background-color posés sur une <table>
// et ne respecte que ce qui est déclaré directement sur chaque <td>. La carte de
// contenu n'avait son fond opaque que sur la <table> elle-même — invisible pour ce
// client précis, qui laissait alors transparaître l'image de fond de la table
// extérieure derrière le texte. On force donc bgcolor sur chaque cellule de la carte,
// sauf celles qui portent déjà un dégradé doré volontaire (boutons, séparateurs) —
// leur fond de secours doit rester doré, pas la couleur sombre de la carte.
function nlForceOpaqueCells(html, color) {
  return String(html).replace(/<td((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*>/gi, (full, attrs) => {
    if (/\bbgcolor\s*=/i.test(attrs) || /linear-gradient/i.test(attrs)) return full;
    return `<td bgcolor="${color}"${attrs}>`;
  });
}

// ── Corrections typographiques du corps des communications ────────────────────
// Le texte vient du générateur IA puis d'une retouche à la main : il manque
// régulièrement le point final d'un paragraphe, et les espaces insécables que la
// typographie française impose devant ; : ! ? et à l'intérieur des guillemets.
// La correction se fait au rendu (et pas à la génération) pour que l'aperçu du
// dashboard, l'envoi de test et l'envoi réel affichent toujours la même chose,
// quelle que soit la façon dont le brouillon a été écrit ou modifié.
const NL_NBSP = '\u00a0'; // insécable classique — le fin (U+202F) passe mal dans certains clients mail

// Met de côté ce qui ne doit jamais être retouché : balises, entités HTML, URLs
// et adresses email. Sans ça, le « : » de « https:// » serait traité comme une
// ponctuation double et le « ; » de « &amp; » comme une fin de proposition.
function nlShieldMarkup(html) {
  const shielded = [];
  const text = String(html).replace(
    /(<[^>]+>)|(&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+);)|((?:https?:\/\/|mailto:)[^\s<]+)|([\w.+-]+@[\w-]+\.[\w.-]+)/g,
    (match, tag, entity) => {
      shielded.push({ text: match, kind: tag ? 'tag' : entity ? 'entity' : 'link' });
      return `\u0000${shielded.length - 1}\u0000`;
    }
  );
  return { text, shielded };
}

function nlUnshieldMarkup(text, shielded) {
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => shielded[Number(i)].text);
}

// Ajoute le point final manquant. Opère sur le dernier fragment de texte réel :
// un paragraphe qui finit par « …</strong> » doit recevoir son point avant la
// balise fermante, pas après.
function nlAddFinalPeriod(text, shielded) {
  const parts = text.split(/(\u0000\d+\u0000)/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const placeholder = parts[i].match(/^\u0000(\d+)\u0000$/);
    if (placeholder) {
      // Une balise fermante ne compte pas comme fin de paragraphe : on continue
      // à remonter. Une URL ou une entité, si — on ne colle pas un point derrière.
      if (shielded[Number(placeholder[1])].kind === 'tag') continue;
      return text;
    }
    const trimmed = parts[i].replace(/\s+$/, '');
    if (!trimmed) continue;
    // Déjà ponctué, ou terminé par un guillemet / une parenthèse / un tiret : rien à faire.
    if (/[.!?…:;»"')\]\-–—]$/.test(trimmed)) return text;
    // Se termine par autre chose qu'une lettre ou un chiffre (emoji, symbole) : on s'abstient.
    if (!/[\p{L}\p{N}]$/u.test(trimmed)) return text;
    // Signature ou libellé court (« Rudy », « Bonne lecture ») : pas un paragraphe à ponctuer.
    if (trimmed.trim().split(/\s+/).length < 3) return text;
    parts[i] = trimmed + '.';
    return parts.join('');
  }
  return text;
}

/**
 * Nettoyage typographique d'un fragment de HTML déjà rendu.
 * @param {string} html fragment produit par renderPara
 * @param {{addFinalPeriod?: boolean}} [options] le point final ne s'applique qu'aux
 *        paragraphes courants — les puces d'une liste sont souvent des fragments
 *        volontairement non ponctués.
 */
function nlFixTypography(html, { addFinalPeriod = false } = {}) {
  const { text, shielded } = nlShieldMarkup(html);
  let out = text
    .replace(/[ \t]{2,}/g, ' ')                                                  // espaces multiples
    .replace(/[ \u00a0\u202f]+([,.])/g, '$1')                                    // pas d'espace avant , et .
    .replace(/([^\s\u00a0\u202f])[ \u00a0\u202f]*([;:!?]+)/g, `$1${NL_NBSP}$2`)  // insécable avant ponctuation double
    .replace(/«[ \u00a0\u202f]*/g, `«${NL_NBSP}`)                                // « ouvrant collé par une insécable
    .replace(/[ \u00a0\u202f]*»/g, `${NL_NBSP}»`)                                // » fermant idem
    .replace(/([,;:!?])([\p{L}«"'(])/gu, '$1 $2')                                // espace manquant après la ponctuation
    // Espace manquant après un point de fin de phrase (« ne disent pas.Les silences »).
    // Le point est le cas délicat : on n'insère l'espace que si le caractère qui précède
    // est une minuscule ou un chiffre ET que celui qui suit est une majuscule. Les sigles
    // (« S.N.C.F »), les décimales et les extensions de fichier restent donc intacts ;
    // les URLs et adresses email sont déjà mises à l'abri par nlShieldMarkup.
    .replace(/([\p{Ll}\p{N}][.…]+)(?=[\p{Lu}«])/gu, '$1 ');
  if (addFinalPeriod) out = nlAddFinalPeriod(out, shielded);
  return nlUnshieldMarkup(out, shielded);
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
  // Normalise les frontières de paragraphes AVANT le découpage ci-dessous, qui ne sait
  // couper que sur « </p><p> ».
  //
  // L'éditeur du dashboard est un contenteditable : le texte généré arrive en <p>, mais
  // chaque ligne ajoutée ensuite à la main crée un <div> (comportement de Chrome et Edge
  // sur la touche Entrée), ou un double <br> si la ligne a été saisie avec Maj+Entrée.
  // Ces blocs-là ne correspondant pas au motif de découpage, ils étaient absorbés par le
  // paragraphe précédent et leurs balises retirées par le filtre : dans le même email,
  // les paragraphes venant du générateur restaient aérés pendant que ceux écrits à la
  // main se retrouvaient collés au précédent. D'où l'irrégularité de mise en page.
  //
  // On isole aussi les blocs <ul>/<ol> comme paragraphes à part entière, pour que les
  // listes à puces survivent jusqu'à l'email final au lieu d'être aplaties.
  //
  // Enfin, l'éditeur est en `white-space: pre-wrap` : une partie des retours à la ligne
  // y est stockée en simple caractère \n, visible à l'écran mais réduit à une espace par
  // le rendu HTML de l'email — d'où des lignes qui se collaient entre l'aperçu et le mail
  // reçu. On les convertit donc en balises avant tout découpage, après avoir écarté les
  // \n qui ne font que séparer deux balises de bloc dans le HTML source (mise en forme
  // du code, pas du texte).
  const BLOCK_TAG = '(?:p|div|ul|ol|li|h[1-6]|blockquote|table|tbody|tr|td)';
  const normalizedContent = isHtml
    ? content
        .replace(/\r\n?/g, '\n')
        .replace(new RegExp(`\\s*\\n\\s*(?=</?${BLOCK_TAG}\\b)`, 'gi'), '')
        .replace(new RegExp(`(</?${BLOCK_TAG}\\b[^>]*>)\\s*\\n\\s*`, 'gi'), '$1')
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/<div[^>]*>/gi, '<p>')
        .replace(/<\/div>/gi, '</p>')
        .replace(/(?:<br\s*\/?>\s*){2,}/gi, '</p><p>')
        .replace(/\s*(<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)\s*/gi, '</p><p>$1</p><p>')
    : content;
  // Un paragraphe sans aucun texte visible ne doit pas produire de ligne dans l'email.
  // L'éditeur en crée en permanence — une ligne vide laissée entre deux paragraphes y
  // arrive sous la forme <div><br></div> ou <p>&nbsp;</p>. À l'écran elle vaut une simple
  // ligne vide, mais rendue en paragraphe à part entière elle ajoutait sa marge basse de
  // 20px à celle du paragraphe précédent : d'où des écarts deux fois plus grands à
  // certains endroits, et une mise en page qui ne correspondait pas à celle du dashboard.
  // L'espacement entre paragraphes est désormais le même partout, quelle que soit la
  // façon dont le brouillon a été saisi.
  const hasVisibleText = (p) => String(p)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .trim().length > 0;
  const paragraphs = isHtml
    ? normalizedContent.split(/<\/p>\s*<p[^>]*>/i).map(p => p.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '').trim()).filter(hasVisibleText)
    : normalizedContent.split(/\n+/).map(p => p.trim()).filter(hasVisibleText);
  // Rendu d'un paragraphe : autorise b/strong/i/em/u/br/ul/ol/li/a, échappe le reste
  const renderPara = (para) => isHtml
    ? nlStyleLinks(para.replace(/<(?!\/?(?:b|strong|i|em|u|br|ul|ol|li|a)\b)[^>]*>/gi, ''))
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
      const styledList = nlFixTypography(renderPara(para))
        .replace(/<ul[^>]*>/i, '<ul style="margin:0; padding-left:22px; color:#c8c0a8; font-size:16px; line-height:1.85; font-family:Georgia,serif;">')
        .replace(/<ol[^>]*>/i, '<ol style="margin:0; padding-left:22px; color:#c8c0a8; font-size:16px; line-height:1.85; font-family:Georgia,serif;">')
        .replace(/<li[^>]*>/gi, '<li style="margin-bottom:8px; padding-left:4px;">');
      return `<tr><td style="padding:0 32px 20px;">${styledList}</td></tr>`;
    }
    // Texte justifié, comme annoncé dans l'éditeur du dashboard. `text-justify:inter-word`
    // force la répartition sur les espaces (et pas à l'intérieur des mots) sur les moteurs
    // qui le gèrent, ce qui limite les blancs irréguliers faute de césure française.
    return `<tr><td style="padding:0 32px 20px;">
    <div style="color:#c8c0a8; font-size:16px; line-height:1.8; font-family:Georgia,serif; text-align:justify; text-justify:inter-word;">${nlFixTypography(renderPara(para), { addFinalPeriod: true })}</div>
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

  // L'image de fond reste sur la table extérieure — elle habille les marges de chaque côté
  // de la carte. C'est la carte elle-même qui devait changer : elle reposait sur un dégradé
  // semi-transparent (rgba), or ni Gmail (web et mobile) ni Outlook ne gèrent les dégradés
  // CSS sur une <table>. Le conteneur restait donc transparent et, dès que le destinataire
  // chargeait les images — ou transférait le message —, la photo remontait derrière le texte,
  // qui devenait illisible. La carte a maintenant un fond opaque, porté à la fois par
  // l'attribut bgcolor (Outlook) et par background-color : l'image ne peut plus la traverser.
  // Les liens Google Fonts sont retirés au passage : aucun client mail ne charge de feuille
  // de style externe, et ces requêtes distantes pèsent dans le score anti-spam.
  // Le contenu de la carte est construit à part pour lui appliquer nlForceOpaqueCells :
  // un fond opaque forcé sur chaque cellule, nécessaire pour Hotmail/Outlook.com qui
  // ignore le fond posé sur la <table> elle-même (voir le commentaire de la fonction).
  // La table extérieure, elle, n'est pas concernée par ce traitement : c'est
  // précisément là que l'image de fond doit rester visible, sur les marges.
  const cardInner = nlForceOpaqueCells(`
  <tr><td style="padding:0; line-height:0;">
    <a href="https://oradia.fr" target="_blank" style="display:block; line-height:0;">
      <img src="https://oradia.fr/images/medias/bandeau_newsletter.webp" alt="Oradia — La Boussole Intérieure" width="700" style="display:block; width:100%; height:auto; max-width:700px;">
    </a>
  </td></tr>
  <tr><td style="padding:14px 32px; text-align:center; background:rgba(212,175,55,0.06); border-bottom:1px solid rgba(212,175,55,0.15);">
    <a href="https://oradia.fr" target="_blank" style="color:#d4af37; text-decoration:none; font-size:13px; font-weight:700; letter-spacing:0.04em; font-family:Georgia,serif;">Pas le temps de tout lire ? <span style="text-decoration:underline;">Direction oradia.fr →</span></a>
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
    <p style="margin:0 0 18px;"><a href="https://oradia.fr" style="color:#d4af37; text-decoration:none; font-size:13px; letter-spacing:0.08em; font-family:Georgia,serif;">oradia.fr</a></p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px;">
      <tr>
        <td style="padding:0 8px;">
          <a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank" style="text-decoration:none;">
            <img src="https://oradia.fr/images/medias/icon-facebook.png" alt="Facebook Oradia" width="40" height="40" style="display:block; width:40px; height:40px; border:0;">
          </a>
        </td>
        <td style="padding:0 8px;">
          <a href="https://instagram.com/oradia_oracle_officiel" target="_blank" style="text-decoration:none;">
            <img src="https://oradia.fr/images/medias/icon-instagram.png" alt="Instagram Oradia" width="40" height="40" style="display:block; width:40px; height:40px; border:0;">
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0; color:#c8c0a8; font-size:11px; opacity:0.4; font-family:Georgia,serif;">Vous recevez cet email car vous êtes abonné·e aux communications Oradia.<br><a href="{unsubscribe}" style="color:#c8c0a8; text-decoration:underline;">Se désabonner</a></p>
  </td></tr>`, '#0a192f');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0; padding:0; background-color:#040d1c;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#040d1c" background="https://oradia.fr/images/oradia-hero-4k.webp" style="background-color:#040d1c; background-image:url('https://oradia.fr/images/oradia-hero-4k.webp'); background-size:cover; background-position:center; background-repeat:no-repeat;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a192f" style="background-color:#0a192f; max-width:700px; margin:0 auto; border-radius:16px; overflow:hidden; border:1px solid rgba(212,175,55,0.18); box-shadow:0 10px 40px rgba(0,0,0,0.4);">
${cardInner}
</table>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

// ── Délivrabilité ─────────────────────────────────────────────────────────────
// Un email HTML envoyé sans partie texte est un signal de spam classique (et le seul
// rendu possible pour les lecteurs en mode texte). On dérive la version texte du HTML
// final : impossible qu'elle diverge du message réellement envoyé.
// Le jeton {unsubscribe} traverse la conversion et reste substituable par destinataire.
function nlEmailPlainText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return !text || /^https?:/i.test(text) ? href : `${text} (${href})`;
    })
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|tr|ul|ol|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Désinscription en un clic (RFC 8058). Gmail et Yahoo l'exigent des expéditeurs en
// volume depuis 2024 : sans elle, les destinataires n'ont que le bouton « spam » à
// disposition, et chaque signalement dégrade la réputation du domaine.
// Le paramètre oneclick=1 impose une requête POST côté endpoint, pour qu'un antivirus
// ou un aperçu de lien qui suivrait l'URL en GET ne désinscrive personne à son insu.
function buildOneClickUnsubUrl(email) {
  return `https://oradia.fr/api/admin/unsubscribe?email=${encodeURIComponent(email)}&token=${generateUnsubToken(email)}&oneclick=1`;
}

function nlBulkHeaders(email) {
  return {
    'List-Unsubscribe': `<${buildOneClickUnsubUrl(email)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

// ── Envoi ciblé : campagne Brevo plutôt qu'API transactionnelle ───────────────
// Les envois ciblés (par catégorie, ou « ceux qui ne l'ont pas encore reçu ») partaient par
// l'API transactionnelle, un email à la fois. Or Brevo — comme Gmail et Yahoo — sépare le
// flux transactionnel (reçus, mots de passe, alertes) du flux marketing : y faire passer une
// newsletter dégrade la réputation des deux, et c'est l'une des causes du classement en spam.
// Une campagne ne pouvant viser qu'une liste, on en crée une temporaire, on y verse les
// contacts ciblés, on envoie, et les listes des envois précédents sont nettoyées au passage.
//
// Toute défaillance AVANT le déclenchement de la campagne renvoie sentNothing:true : l'appelant
// retombe alors sur l'envoi transactionnel, c'est-à-dire le comportement d'avant. Une fois la
// campagne déclenchée, aucun repli n'est possible sans risquer un double envoi.
const NL_TEMP_LIST_PREFIX = '[auto] Ciblage';

// Brevo n'expose pas la date de création d'une liste : on l'inscrit dans le nom, et on
// supprime ici les listes temporaires de plus de 7 jours. Jamais bloquant.
async function nlPurgeTempLists(api, folderId) {
  const r = await api(`/contacts/folders/${folderId}/lists?limit=50&offset=0`);
  if (!r.ok) return;
  const lists = (await r.json()).lists || [];
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const namePattern = new RegExp(`^${NL_TEMP_LIST_PREFIX.replace(/[[\]]/g, '\\$&')} (\\d{4}-\\d{2}-\\d{2})`);
  for (const l of lists) {
    const m = String(l.name || '').match(namePattern);
    if (m && Date.parse(m[1]) < cutoff) {
      await api(`/contacts/lists/${l.id}`, { method: 'DELETE' }).catch(() => {});
    }
  }
}

async function nlWaitForProcess(api, processId, deadline) {
  while (Date.now() < deadline) {
    const r = await api(`/processes/${processId}`);
    if (r.ok) {
      const status = (await r.json()).status;
      if (status === 'completed') return true;
      if (status === 'failed') return false;
    }
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  return false;
}

async function nlSendTargetedCampaign({ BREVO_API_KEY, emails, subject, html, type, deadline }) {
  const api = (path, options = {}) => fetch(`https://api.brevo.com/v3${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY, ...(options.headers || {}) }
  });
  const fail = (stage, error) => ({ ok: false, stage, error: String(error).slice(0, 300), sentNothing: true });
  let listId = null;
  const dropList = async () => { if (listId) await api(`/contacts/lists/${listId}`, { method: 'DELETE' }).catch(() => {}); };

  try {
    // 1. Dossier d'accueil : celui de la liste newsletter, sinon le premier disponible.
    let folderId = null;
    const listRes = await api('/contacts/lists/5');
    if (listRes.ok) folderId = (await listRes.json()).folderId ?? null;
    if (!folderId) {
      const foldersRes = await api('/contacts/folders?limit=1&offset=0');
      if (foldersRes.ok) folderId = (await foldersRes.json()).folders?.[0]?.id ?? null;
    }
    if (!folderId) return fail('folder', 'Aucun dossier de contacts Brevo accessible');

    await nlPurgeTempLists(api, folderId).catch(() => {});

    const stamp = new Date().toISOString().slice(0, 10);
    const name = `${NL_TEMP_LIST_PREFIX} ${stamp} — ${subject}`.slice(0, 90);
    const createRes = await api('/contacts/lists', { method: 'POST', body: JSON.stringify({ name, folderId }) });
    if (!createRes.ok) return fail('list', await createRes.text());
    listId = (await createRes.json()).id;

    // 2. Import des contacts ciblés. `updateExistingContacts:false` et l'absence délibérée
    //    de emailBlacklist / smsBlacklist sont la garantie qu'un import ne réécrit jamais le
    //    statut d'un contact déjà connu de Brevo : personne ne peut être réabonné à son insu.
    const importRes = await api('/contacts/import', {
      method: 'POST',
      body: JSON.stringify({
        listIds: [listId],
        updateExistingContacts: false,
        emptyContactsAttributes: false,
        disableNotification: true,
        jsonBody: emails.map(email => ({ email }))
      })
    });
    if (!importRes.ok) { await dropList(); return fail('import', await importRes.text()); }
    const processId = (await importRes.json().catch(() => ({})))?.processId ?? null;
    if (processId && !(await nlWaitForProcess(api, processId, deadline))) {
      await dropList();
      return fail('import', "L'import des contacts n'a pas abouti dans le temps imparti");
    }

    // 3. Vérification avant tir. L'import est asynchrone et sa sémantique dépend du plan
    //    Brevo : si la liste est restée vide, la campagne partirait dans le vide. On préfère
    //    repasser en transactionnel plutôt que de croire un envoi parti alors qu'il ne l'est pas.
    const checkRes = await api(`/contacts/lists/${listId}`);
    const subscribers = checkRes.ok ? ((await checkRes.json()).uniqueSubscribers ?? 0) : 0;
    if (!subscribers) { await dropList(); return fail('verify', 'La liste temporaire est vide après import'); }

    const campRes = await api('/emailCampaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: `${type === 'promo' ? 'Promo' : 'Newsletter'} ciblée — ${subject} — ${new Date().toISOString()}`,
        subject,
        sender: { name: 'Oradia', email: 'contact@oradia.fr' },
        replyTo: 'contact@oradia.fr',
        htmlContent: html.replace('{unsubscribe}', '{{ unsubscribe }}'),
        recipients: { listIds: [listId] }
      })
    });
    if (!campRes.ok) { await dropList(); return fail('campaign', await campRes.text()); }
    const campaignId = (await campRes.json()).id;

    const sendRes = await api(`/emailCampaigns/${campaignId}/sendNow`, { method: 'POST' });
    if (!sendRes.ok) {
      // La campagne existe mais n'est pas partie : elle reste en brouillon dans Brevo, prête
      // à être envoyée à la main. Pas de repli transactionnel ici — le doute sur ce qui est
      // réellement parti interdit tout second envoi automatique.
      return { ok: false, stage: 'send', error: String(await sendRes.text()).slice(0, 300), sentNothing: false, campaignId };
    }
    return { ok: true, campaignId, listId, subscribers };
  } catch (e) {
    await dropList();
    return fail('exception', e.message);
  }
}

// Traçage post-envoi, commun aux deux canaux (campagne ou transactionnel) : quels contacts
// ont reçu quoi, et passage du brouillon à l'état « envoyé ».
async function nlMarkSent(supabase, { emails, subject, draftId, excludeAlreadySent, sent, failedEmails = [] }) {
  if (emails.length > 0) {
    if (excludeAlreadySent) {
      await supabase
        .from('newsletter_contacts')
        .update({ precommande_launch_sent_at: new Date().toISOString() })
        .in('email', emails);
    }
    // Colonne optionnelle — ignoré silencieusement si la migration last-newsletter
    // n'a pas été exécutée.
    try {
      await supabase
        .from('newsletter_contacts')
        .update({ last_newsletter_sent_at: new Date().toISOString(), last_newsletter_subject: subject })
        .in('email', emails);
    } catch (_) {}
  }
  await supabase
    .from('newsletter_drafts')
    .update({
      statut: 'envoyé',
      sent_at: new Date().toISOString(),
      subject,
      sent_count: sent,
      failed_count: failedEmails.length,
      failed_emails: failedEmails
    })
    .eq('id', draftId);
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

      // Archiver / désarchiver une newsletter (sort de la liste de travail sans la supprimer)
      if (action === 'set-archived') {
        const { draft_id, archived } = body;
        if (!draft_id) return res.status(400).json({ error: 'draft_id requis' });
        const { error } = await supabase.from('newsletter_drafts')
          .update({ archived: archived === true }).eq('id', draft_id);
        if (error) {
          if (error.code === '42703') return res.status(400).json({ error: 'Migration archived requise (colonne absente)' });
          throw error;
        }
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
        const text = nlEmailPlainText(html);

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

        // Même canal marketing que la diffusion ciblée, avec le même repli transactionnel.
        let resendFallbackReason = null;
        if (await isFeatureEnabled(supabase, 'newsletter_campagne_ciblee')) {
          const campaign = await nlSendTargetedCampaign({
            BREVO_API_KEY, emails: targets, subject: finalSubject, html,
            type: lastDraft.type, deadline: Date.now() + 15000
          });
          if (campaign.ok) {
            await supabase
              .from('newsletter_contacts')
              .update({ last_newsletter_sent_at: new Date().toISOString(), last_newsletter_subject: finalSubject })
              .in('email', targets);
            return res.status(200).json({
              success: true, channel: 'campagne', campaignId: campaign.campaignId,
              subject: finalSubject, sent: targets.length, failed: 0, failedEmails: [],
              message: `Campagne envoyée à ${campaign.subscribers} contact(s) sur ${targets.length} ciblé(s).`
            });
          }
          if (!campaign.sentNothing) {
            return res.status(502).json({
              error: `La campagne a été créée dans Brevo mais son envoi n'a pas démarré (${campaign.error}). `
                + `Aucun repli automatique n'est tenté pour ne pas risquer un double envoi : `
                + `retrouve la campagne dans Brevo → Campagnes et lance-la à la main.`
            });
          }
          resendFallbackReason = `${campaign.stage} : ${campaign.error}`;
          console.warn('[newsletter] resend-last : repli transactionnel —', resendFallbackReason);
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
              replyTo: { name: "Rudy d'Oradia", email: 'contact@oradia.fr' },
              subject: finalSubject,
              htmlContent: html.replace('{unsubscribe}', buildUnsubUrl(email)),
              textContent: text.replace('{unsubscribe}', buildUnsubUrl(email)),
              headers: nlBulkHeaders(email)
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

        return res.status(200).json({ success: true, channel: 'transactionnel', fallbackReason: resendFallbackReason, subject: finalSubject, sent, failed: failedEmails.length, failedEmails });
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
        const text = nlEmailPlainText(html);

        const BREVO_API_KEY = process.env.BREVO_API_KEY;
        if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY non configurée' });

        if (test_email) {
          const r = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
            body: JSON.stringify({
              sender: { name: 'Oradia', email: 'contact@oradia.fr' },
              to: [{ email: test_email }],
              replyTo: { name: "Rudy d'Oradia", email: 'contact@oradia.fr' },
              subject: '[TEST] ' + finalSubject,
              htmlContent: html.replace('{unsubscribe}', 'https://oradia.fr'),
              textContent: text.replace('{unsubscribe}', 'https://oradia.fr')
            })
          });
          if (!r.ok) {
            return res.status(502).json({ error: await brevoErrorMessage(r, "Erreur lors de l'envoi du test") });
          }
          return res.status(200).json({ success: true });
        }

        // Diffusion ciblée : aux contacts portant une (ou plusieurs) catégorie(s), les catégories
        // restant gérées uniquement dans le dashboard. exclude_already_sent emprunte le même
        // chemin (même sans catégorie) pour permettre le suivi par contact.
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

          // Canal marketing d'abord : une campagne Brevo, comme pour la diffusion à la liste
          // complète. Le drapeau `newsletter_campagne_ciblee` permet de revenir à l'ancien
          // canal depuis Supabase sans redéploiement (drapeau absent = campagne active).
          let fallbackReason = null;
          if (await isFeatureEnabled(supabase, 'newsletter_campagne_ciblee')) {
            const campaign = await nlSendTargetedCampaign({
              BREVO_API_KEY,
              emails,
              subject: finalSubject,
              html,
              type: draft.type,
              deadline: Date.now() + 15000
            });

            if (campaign.ok) {
              await nlMarkSent(supabase, {
                emails, subject: finalSubject, draftId: draft_id,
                excludeAlreadySent: exclude_already_sent, sent: emails.length
              });
              return res.status(200).json({
                success: true,
                channel: 'campagne',
                campaignId: campaign.campaignId,
                recipients: emails.length,
                sent: emails.length,
                failed: 0,
                failedEmails: [],
                // Écart normal : un contact désinscrit ou blacklisté côté Brevo est ciblé
                // par la requête Supabase mais exclu de la liste — donc de l'envoi.
                message: `Campagne envoyée à ${campaign.subscribers} contact(s) sur ${emails.length} ciblé(s).`
              });
            }

            if (!campaign.sentNothing) {
              return res.status(502).json({
                error: `La campagne a été créée dans Brevo mais son envoi n'a pas démarré (${campaign.error}). `
                  + `Aucun repli automatique n'est tenté pour ne pas risquer un double envoi : `
                  + `retrouve la campagne dans Brevo → Campagnes et lance-la à la main.`
              });
            }

            // Rien n'est parti : on reprend l'envoi transactionnel, à l'identique d'avant.
            fallbackReason = `${campaign.stage} : ${campaign.error}`;
            console.warn('[newsletter] campagne ciblée impossible, repli transactionnel —', fallbackReason);
          }

          // Repli : envoi individuel par lots (un email par destinataire, pas de diffusion
          // groupée visible) pour rester dans le temps d'exécution de la fonction serverless.
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
                replyTo: { name: "Rudy d'Oradia", email: 'contact@oradia.fr' },
                subject: finalSubject,
                htmlContent: html.replace('{unsubscribe}', buildUnsubUrl(email)),
                textContent: text.replace('{unsubscribe}', buildUnsubUrl(email)),
                headers: nlBulkHeaders(email)
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

          await nlMarkSent(supabase, {
            emails: sentEmails, subject: finalSubject, draftId: draft_id,
            excludeAlreadySent: exclude_already_sent, sent, failedEmails
          });

          return res.status(200).json({
            success: true,
            channel: 'transactionnel',
            fallbackReason,
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
            // Campagne (un seul HTML pour toute la liste) : on ne peut pas injecter
            // un token par destinataire, donc on utilise la variable native Brevo
            // {{ unsubscribe }} — le désabonnement remonte ensuite via le webhook Brevo.
            htmlContent: html.replace('{unsubscribe}', '{{ unsubscribe }}'),
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

Contrainte impérative de format : chaque texte doit COMMENCER par le lien "oradia.fr" sur sa propre ligne (avant même la première phrase), pour que le site soit immédiatement visible sans avoir à lire tout le post.

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
    if (!facebook_text) facebook_text = `oradia.fr\n\n${subject}\n\n${textContent.substring(0, 400)}...`;
    if (!instagram_text) instagram_text = `oradia.fr\n\n${subject}\n\n${textContent.substring(0, 150)}...\n\n#oradia #oracle #developpementpersonnel #tore #conscience`;
    } // fin du bloc else (génération IA)

    const DEFAULT_IMAGE = 'https://oradia.fr/images/logo-hd-v2.webp';
    let image_url = imageUrl || DEFAULT_IMAGE;

    // Mode aperçu : retourne le texte sans envoyer à Make.com
    if (previewOnly) {
      return res.status(200).json({ success: true, facebook_text, instagram_text, image_url, preview: true });
    }

    // Recadrage automatique si le ratio est hors des bornes acceptées par Instagram/Facebook
    // (voir ensureSafeSocialImageUrl) — évite l'erreur Graph API 36003 sans bloquer l'envoi.
    image_url = await ensureSafeSocialImageUrl(image_url);

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
      if (req.method === 'POST') {
        const body = await parseBody(req);
        // Publier immédiatement un post programmé (ex. rattrapage d'un post en retard)
        if (body.action === 'publish-now' && body.id) {
          const { data: post, error: fErr } = await sbSocialList.from('social_posts').select('*').eq('id', body.id).maybeSingle();
          if (fErr) return res.status(500).json({ error: fErr.message });
          if (!post) return res.status(404).json({ error: 'Post introuvable' });
          const MAKE_WEBHOOK_URL = process.env.MAKE_SOCIAL_WEBHOOK_URL;
          if (!MAKE_WEBHOOK_URL) return res.status(400).json({ error: 'MAKE_SOCIAL_WEBHOOK_URL manquant côté serveur' });
          try {
            const makeRes = await fetch(MAKE_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subject: post.subject, facebook_text: post.facebook_text, instagram_text: post.instagram_text, image_url: post.image_url, schedule_at: null, sent_at: new Date().toISOString() })
            });
            if (!makeRes.ok) throw new Error(`Make.com ${makeRes.status}`);
            await sbSocialList.from('social_posts').update({ statut: 'envoyé', sent_at: new Date().toISOString() }).eq('id', post.id);
            return res.status(200).json({ success: true });
          } catch (e) {
            await sbSocialList.from('social_posts').update({ statut: 'échec', error_message: e.message }).eq('id', post.id);
            return res.status(502).json({ error: e.message });
          }
        }
        // Marquer comme publié SANS renvoyer (cas d'un post deja en ligne via Make.com)
        if (body.action === 'mark-published' && body.id) {
          const { error } = await sbSocialList.from('social_posts')
            .update({ statut: 'envoyé', sent_at: new Date().toISOString() }).eq('id', body.id);
          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ success: true });
        }
        // Archiver / desarchiver un post publie
        if (body.action === 'set-archived' && body.id) {
          const { error } = await sbSocialList.from('social_posts')
            .update({ archived: body.archived === true }).eq('id', body.id);
          if (error) {
            if (error.code === '42703') return res.status(400).json({ error: 'Migration archived (social_posts) requise' });
            return res.status(500).json({ error: error.message });
          }
          return res.status(200).json({ success: true });
        }
        return res.status(400).json({ error: 'Action inconnue' });
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

      // Récupérer les 20 dernières campagnes envoyées avec leurs statistiques.
      // IMPORTANT : depuis une évolution de l'API Brevo, les statistiques ne sont
      // PLUS incluses par défaut — il faut explicitement demander statistics=globalStats,
      // sinon chaque campagne revient avec 0 délivré / 0% partout (bug corrigé ici).
      let campRes = await fetch('https://api.brevo.com/v3/emailCampaigns?status=sent&limit=20&sort=desc&statistics=globalStats', {
        headers: { 'api-key': BREVO_API_KEY }
      });
      if (!campRes.ok) {
        // Repli : on retire limit/sort (source d'anciennes 503 transitoires) mais on
        // GARDE statistics=globalStats, sans quoi les chiffres resteraient à zéro.
        campRes = await fetch('https://api.brevo.com/v3/emailCampaigns?status=sent&statistics=globalStats', {
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

      // Lien de l'en-tête List-Unsubscribe (RFC 8058) : la désinscription ne doit se
      // produire que sur le POST envoyé par le client mail. Cette URL circule en clair
      // dans les en-têtes ; un antivirus ou un générateur d'aperçu qui la visiterait en
      // GET désinscrirait l'abonné sans qu'il ait rien demandé.
      if (urlParams.get('oneclick') === '1' && req.method !== 'POST') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).end(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${nlEscHtml(buildUnsubUrl(email))}"></head><body><p><a href="${nlEscHtml(buildUnsubUrl(email))}">Confirmer ma désinscription</a></p></body></html>`);
      }
      const expectedToken = generateUnsubToken(email);
      if (token !== expectedToken) return res.status(403).json({ error: 'Lien invalide ou expiré' });
      const sb = createClient(
        process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      // Match insensible à la casse : les contacts importés de Brevo ou ajoutés
      // manuellement peuvent être stockés avec des majuscules, alors que `email`
      // est normalisé en minuscules. On échappe les jokers SQL (_ et %, qui sont
      // des caractères valides dans une adresse) pour éviter tout sur-appariement.
      const emailPattern = email.replace(/[\\%_]/g, (c) => '\\' + c);
      await sb.from('newsletter_contacts')
        .update({ status: 'unsubscribed', brevo_synced: false, unsubscribed_at: new Date().toISOString() })
        .ilike('email', emailPattern);
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

      // Contacts déjà désinscrits localement : la désinscription locale prime, on ne les
      // réactive JAMAIS même s'ils sont encore présents dans la liste Brevo 5.
      const { data: localUnsub } = await sb.from('newsletter_contacts')
        .select('email').eq('status', 'unsubscribed');
      const localUnsubSet = new Set((localUnsub || []).map(c => (c.email || '').toLowerCase().trim()));

      // Upsert dans Supabase — les contacts blacklistés passent en unsubscribed
      let pulled = 0;
      const toReblacklist = [];
      if (brevoContacts.length > 0) {
        const rows = brevoContacts.map(c => {
          const email = (c.email || '').toLowerCase().trim();
          // Désinscrit localement mais pas encore blacklisté côté Brevo → on garde
          // unsubscribed et on planifie un re-blacklist pour aligner Brevo.
          if (localUnsubSet.has(email) && !c.emailBlacklisted) {
            toReblacklist.push(email);
            return { email, status: 'unsubscribed', brevo_synced: false, brevo_synced_at: now, source: 'brevo-sync' };
          }
          return {
            email,
            status: c.emailBlacklisted ? 'unsubscribed' : 'active',
            brevo_synced: !c.emailBlacklisted,
            brevo_synced_at: now,
            source: 'brevo-sync'
          };
        }).filter(r => r.email);
        const { error } = await sb.from('newsletter_contacts')
          .upsert(rows, { onConflict: 'email' });
        if (!error) pulled = rows.length;
      }

      // Aligne Brevo : blackliste + retire de la liste 5 les désinscrits locaux encore actifs côté Brevo
      if (toReblacklist.length > 0) {
        for (const email of toReblacklist) {
          try {
            await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
              body: JSON.stringify({ emailBlacklisted: true })
            });
          } catch (_) {}
        }
        try {
          await fetch('https://api.brevo.com/v3/contacts/lists/5/contacts/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
            body: JSON.stringify({ emails: toReblacklist })
          });
        } catch (_) {}
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
      // Validité scientifique : uniquement les tirages 100% quantiques (ANU ou Outshift)
      const anuRows = (rows || []).filter(r => QUANTUM_SOURCES.includes(r.qrng_source));
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

      // Résonance immédiate : note 1-10 donnée juste après l'analyse (distincte des
      // synchronicités observées dans les jours suivants). Dégrade en jeu vide si la
      // migration resonance_immediate n'a pas encore été exécutée.
      let resonanceImmediate = { total: 0, avgScore: null, distrib: [] };
      try {
        const { data: resRows, error: resErr } = await sbSync
          .from('resonance_immediate')
          .select('score');
        if (!resErr && Array.isArray(resRows)) {
          const total = resRows.length;
          const avg = total > 0 ? (resRows.reduce((s, r) => s + (r.score || 0), 0) / total).toFixed(1) : null;
          const distrib = Array.from({ length: 10 }, (_, i) => ({
            score: i + 1,
            count: resRows.filter(r => r.score === i + 1).length
          }));
          resonanceImmediate = { total, avgScore: avg, distrib };
        }
      } catch (_) {}

      // Pas de cache : la page publique de l'étude doit refléter les données en temps réel.
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        success: true,
        totalTirages,
        data: { total: anuRows.length, avgScore, scoreDistrib, typeCounts, resonanceCounts },
        resonanceImmediate
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
        // ── Erreur JS côté client (envoyée par js/page-tracker.js) ──
        // On la journalise dans system_logs (source=client) pour que le dashboard
        // mesure aussi les vrais bugs UX, en plus des erreurs serveur.
        const clientError = String(body.client_error || '').slice(0, 300);
        const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
        if (clientError) {
          await logSystemEvent(sb, {
            level: 'error',
            source: 'client',
            method: 'JS',
            path: pagePath || null,
            message: clientError,
            details: {
              error_source: String(body.error_source || '').slice(0, 300),
              line: body.error_line || null,
              col: body.error_col || null,
              user_agent: userAgent || null
            }
          });
          return res.status(204).end();
        }
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

    // ── Étude rétrocausalité : enregistrement d'une session (route PUBLIQUE, depuis tore.html) ──
    // Reçoit le "présent" (octet live du tirage). Le serveur y adjoint le "passé"
    // (octet du pool scellé AVANT l'intention). Le "futur" est résolu plus tard par le cron.
    if (path === '/experiment-record' || path === '/experiment-record/') {
      if (req.method !== 'POST') return res.status(405).end();
      try {
        const body = await parseBody(req);
        const presentByte = parseInt(body.present_byte, 10);
        if (!Number.isInteger(presentByte) || presentByte < 0 || presentByte > 255) return res.status(204).end();
        const qrngSource = String(body.qrng_source || 'unknown').slice(0, 20);
        const sessionId = String(body.session_id || '').slice(0, 100) || null;
        let intentionAt = new Date();
        if (body.intention_at) { const d = new Date(body.intention_at); if (!isNaN(d.getTime())) intentionAt = d; }
        const presentBit = presentByte >= 128 ? 1 : 0;
        const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

        // Assigner le "passé" : plus ancien octet du pool scellé AVANT l'intention
        let pastBit = null, pastCommittedAt = null, pastHash = null;
        try {
          const { data: pb } = await sb.from('retro_pool')
            .select('id, bit_value, committed_at, batch_hash')
            .is('consumed_at', null)
            .lt('committed_at', intentionAt.toISOString())
            .order('committed_at', { ascending: true }).limit(1);
          if (pb && pb[0]) {
            const b = pb[0];
            await sb.from('retro_pool').update({ consumed_at: new Date().toISOString(), consumed_role: 'past', consumed_session: sessionId }).eq('id', b.id);
            pastBit = b.bit_value; pastCommittedAt = b.committed_at; pastHash = b.batch_hash;
          }
        } catch (_) { /* pool absent : session enregistrée sans "passé" */ }

        // source quantique vérifiée (ANU, Outshift) = valide pour l'étude ; sinon exclue (repli crypto)
        const status = QUANTUM_SOURCES.includes(qrngSource) ? 'complete' : 'excluded';
        await sb.from('retro_sessions').insert({
          session_id: sessionId,
          intention_at: intentionAt.toISOString(),
          present_byte: presentByte, present_bit: presentBit,
          past_bit: pastBit, past_committed_at: pastCommittedAt, past_commit_hash: pastHash,
          qrng_source: qrngSource, status
        });
      } catch (_) { /* étude non bloquante : jamais d'erreur renvoyée au visiteur */ }
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

    // ── Compteur de quota quantique ANU (onglet Analytique) ──
    // Compte les appels à l'API ANU du mois en cours (source : table qrng_usage,
    // alimentée par api/qrng.js). Un appel 'anu' = 1 requête qui consomme le quota.
    if (path === '/qrng-stats' || path === '/qrng-stats/') {
      verifyAdminAuth(req);
      if (req.method !== 'GET') return res.status(405).end();
      const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      // Quota mensuel combiné (ANU + Outshift) — configurable via ANU_MONTHLY_QUOTA (défaut : 100, plan gratuit).
      const quota = parseInt(process.env.ANU_MONTHLY_QUOTA || '100', 10);
      try {
        const [anuOnlyRes, outshiftRes, fbRes, recentRes] = await Promise.all([
          sb.from('qrng_usage').select('*', { count: 'exact', head: true }).eq('outcome', 'anu').gte('created_at', monthStart),
          sb.from('qrng_usage').select('*', { count: 'exact', head: true }).eq('outcome', 'outshift').gte('created_at', monthStart),
          sb.from('qrng_usage').select('*', { count: 'exact', head: true }).eq('outcome', 'fallback').gte('created_at', monthStart),
          sb.from('qrng_usage').select('created_at,reason,status_code').eq('outcome', 'fallback').order('created_at', { ascending: false }).limit(5)
        ]);
        if (anuOnlyRes.error) throw anuOnlyRes.error;
        const anuOnly = anuOnlyRes.count || 0;
        const outshiftOnly = outshiftRes.count || 0;
        const anu = anuOnly + outshiftOnly; // total quantique (ANU + Outshift) ; champ 'anu' conservé pour compat dashboard
        const fallback = fbRes.count || 0;
        return res.status(200).json({
          success: true,
          month: monthStart.slice(0, 7),
          anu,
          anu_only: anuOnly,
          outshift: outshiftOnly,
          fallback,
          total: anu + fallback,
          quota,
          quota_pct: quota > 0 ? Math.min(100, Math.round((anu / quota) * 100)) : null,
          recent_fallbacks: recentRes.data || []
        });
      } catch (e) {
        // Table absente (migration non exécutée) ou DB indisponible : on dégrade proprement.
        return res.status(200).json({
          success: false,
          error: 'Table qrng_usage introuvable — exécute supabase-migration-qrng-usage.sql.',
          month: monthStart.slice(0, 7), anu: 0, fallback: 0, total: 0, quota, quota_pct: 0, recent_fallbacks: []
        });
      }
    }

    // ── Étude rétrocausalité : statistiques en direct ──
    // Compare le bit du tirage PRÉSENT au bit PRÉ-TIRÉ (passé) et au bit POST-TIRÉ (futur).
    // Sous H0 (aucun effet), les taux de correspondance valent la baseline marginale.
    if (path === '/experiment-stats' || path === '/experiment-stats/') {
      verifyAdminAuth(req);
      if (req.method !== 'GET') return res.status(405).end();
      const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

      // p-value bilatérale depuis un z : erfc(|z|/√2), approx. Abramowitz & Stegun 7.1.26
      const twoSidedP = (z) => {
        const x = Math.abs(z) / Math.SQRT2;
        const t = 1 / (1 + 0.3275911 * x);
        const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return Math.max(0, Math.min(1, 1 - erf));
      };
      // Statistiques d'un "bras" : correspondance present_bit vs (past_bit|future_bit)
      const arm = (rows, key) => {
        const valid = rows.filter(r => r.present_bit != null && r[key] != null);
        const n = valid.length;
        if (n === 0) return { n: 0, matches: 0, rate: null, baseline: null, deviation: null, z: null, p: null, significant: false };
        let matches = 0, sumP = 0, sumO = 0;
        for (const r of valid) { if (r.present_bit === r[key]) matches++; sumP += r.present_bit; sumO += r[key]; }
        const pPresent = sumP / n, pOther = sumO / n;
        const baseline = pPresent * pOther + (1 - pPresent) * (1 - pOther); // match attendu sous indépendance
        const rate = matches / n;
        const se = Math.sqrt(baseline * (1 - baseline) / n) || 0;
        const z = se > 0 ? (rate - baseline) / se : 0;
        const p = twoSidedP(z);
        return { n, matches, rate, baseline, deviation: rate - baseline, z, p, significant: p < 0.05 };
      };

      try {
        const [sessRes, preRes, poolRes] = await Promise.all([
          sb.from('retro_sessions').select('present_bit,past_bit,future_bit').eq('status', 'complete').in('qrng_source', QUANTUM_SOURCES).limit(200000),
          sb.from('retro_preregistration').select('*').order('registered_at', { ascending: true }).limit(1),
          sb.from('retro_pool').select('*', { count: 'exact', head: true }).is('consumed_at', null)
        ]);
        if (sessRes.error) throw sessRes.error;
        const rows = sessRes.data || [];
        const pre = (preRes.data && preRes.data[0]) || null;
        const targetN = (pre && pre.target_n) || parseInt(process.env.RETRO_TARGET_N || '10000', 10);
        return res.status(200).json({
          success: true,
          n_total: rows.length,
          target_n: targetN,
          progress_pct: targetN > 0 ? Math.min(100, Math.round((rows.length / targetN) * 100)) : null,
          alpha: pre ? Number(pre.alpha) : 0.05,
          registered_at: pre ? pre.registered_at : null,
          hypotheses: pre ? pre.hypotheses : null,
          pool_available: poolRes.count || 0,
          past: arm(rows, 'past_bit'),
          future: arm(rows, 'future_bit')
        });
      } catch (e) {
        return res.status(200).json({
          success: false,
          error: "Tables de l'étude introuvables — exécute supabase-migration-retrocausalite.sql.",
          n_total: 0, target_n: parseInt(process.env.RETRO_TARGET_N || '10000', 10), progress_pct: 0,
          pool_available: 0, past: { n: 0 }, future: { n: 0 }
        });
      }
    }

    // ── Étude passé/présent/futur : version PUBLIQUE (route sans auth admin) ──
    // Mêmes chiffres que /experiment-stats, mais accessible depuis la page publique
    // etude-retrocausalite.html, sur le modèle de /synchronicity-public.
    if (path === '/experiment-public' || path === '/experiment-public/') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const sb = createClient(process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

      if (!(await isFeatureEnabled(sb, 'retro_study_public'))) {
        return res.status(200).json({ success: true, n_total: 0, target_n: 10000, progress_pct: 0, past: { n: 0 }, future: { n: 0 } });
      }

      const twoSidedP = (z) => {
        const x = Math.abs(z) / Math.SQRT2;
        const t = 1 / (1 + 0.3275911 * x);
        const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return Math.max(0, Math.min(1, 1 - erf));
      };
      const arm = (rows, key) => {
        const valid = rows.filter(r => r.present_bit != null && r[key] != null);
        const n = valid.length;
        if (n === 0) return { n: 0, matches: 0, rate: null, baseline: null, deviation: null, z: null, p: null, significant: false };
        let matches = 0, sumP = 0, sumO = 0;
        for (const r of valid) { if (r.present_bit === r[key]) matches++; sumP += r.present_bit; sumO += r[key]; }
        const pPresent = sumP / n, pOther = sumO / n;
        const baseline = pPresent * pOther + (1 - pPresent) * (1 - pOther);
        const rate = matches / n;
        const se = Math.sqrt(baseline * (1 - baseline) / n) || 0;
        const z = se > 0 ? (rate - baseline) / se : 0;
        const p = twoSidedP(z);
        return { n, matches, rate, baseline, deviation: rate - baseline, z, p, significant: p < 0.05 };
      };

      try {
        const [sessRes, preRes] = await Promise.all([
          sb.from('retro_sessions').select('present_bit,past_bit,future_bit').eq('status', 'complete').in('qrng_source', QUANTUM_SOURCES).limit(200000),
          sb.from('retro_preregistration').select('target_n,alpha,registered_at').order('registered_at', { ascending: true }).limit(1)
        ]);
        if (sessRes.error) throw sessRes.error;
        const rows = sessRes.data || [];
        const pre = (preRes.data && preRes.data[0]) || null;
        const targetN = (pre && pre.target_n) || parseInt(process.env.RETRO_TARGET_N || '10000', 10);
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        return res.status(200).json({
          success: true,
          n_total: rows.length,
          target_n: targetN,
          progress_pct: targetN > 0 ? Math.min(100, Math.round((rows.length / targetN) * 100)) : null,
          registered_at: pre ? pre.registered_at : null,
          past: arm(rows, 'past_bit'),
          future: arm(rows, 'future_bit')
        });
      } catch (e) {
        return res.status(200).json({ success: true, n_total: 0, target_n: parseInt(process.env.RETRO_TARGET_N || '10000', 10), progress_pct: 0, past: { n: 0 }, future: { n: 0 } });
      }
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

        // Frais Stripe réels (balance transactions), à titre informatif uniquement —
        // n'affecte jamais le calcul URSSAF (qui se base sur le montant brut encaissé, conformément
        // au régime micro-entrepreneur). Repli sur l'estimation si l'API Stripe est injoignable.
        const STRIPE_SOURCES = ['precommande', 'abonnement', 'don', 'guidance'];
        const stripeRows = recetteRows.filter(t => STRIPE_SOURCES.includes(t.source));
        const feesResult = month
          ? await getMonthlyStripeFees(sb, `${year}-${month.padStart(2,'0')}`)
          : await getStripeFeesForPeriod(`${dateFrom}T00:00:00.000Z`, new Date(Date.parse(`${dateTo}T00:00:00.000Z`) + 86400000));
        const stripeFeesAreReal = feesResult.ok;
        const stripeFees = stripeFeesAreReal
          ? feesResult.feesEur
          : estimateStripeFees(stripeRows.reduce((s, t) => s + parseFloat(t.amount), 0), stripeRows.length);
        // Ce qui reste vraiment : l'URSSAF est un décaissement au même titre que Stripe.
        const tresorerieReelleEstimee = recettes - stripeFees - depenses - urssaf;

        return res.status(200).json({
          success: true,
          data: data || [],
          summary: {
            recettes, depenses, net: recettes - depenses, urssaf,
            stripeFees, stripeFeesAreReal,
            stripeFeesError: stripeFeesAreReal ? null : feesResult.error,
            stripeFeesDetail: stripeFeesAreReal
              ? { processing: feesResult.processingFeesEur, other: feesResult.otherFeesEur, chargeCount: feesResult.chargeCount, refundCount: feesResult.refundCount }
              : null,
            // Conservé pour compatibilité avec le dashboard déjà déployé.
            stripeFeesEstimate: stripeFees,
            tresorerieReelleEstimee,
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

      // ── Santé technique (erreurs, depuis system_logs) ──
      // On distingue les erreurs serveur (API) des erreurs JS côté client
      // (source=client, envoyées par js/page-tracker.js) : ce ne sont pas les mêmes
      // bugs et l'analyse doit les traiter différemment.
      const { data: logs } = await sb.from('system_logs').select('level,source').gte('created_at', since);
      const errors = (logs || []).filter(l => l.level === 'error').length;
      const clientErrors = (logs || []).filter(l => l.level === 'error' && l.source === 'client').length;
      const serverErrors = errors - clientErrors;
      const warnings = (logs || []).filter(l => l.level === 'warning').length;

      // ── Funnel de conversion + conversions réelles de la période ──
      // Calculé AVANT l'analyse IA pour que le prompt dispose des vrais chiffres de
      // conversion (sinon l'IA parle de conversion à l'aveugle). Dégrade proprement
      // si une table/migration manque.
      let funnel = null;
      try {
        const [{ data: toreViews }, { data: events }, { count: newSubs }] = await Promise.all([
          sb.from('page_views').select('session_id').gte('created_at', since).ilike('path', '%tore.html%'),
          sb.from('funnel_events').select('session_id, event_name').gte('created_at', since),
          sb.from('tore_subscriptions').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('status', 'active')
        ]);
        // Funnel CHAÎNÉ : chaque étape ne compte que les sessions ayant franchi
        // cette étape ET toutes les précédentes. Sans chaînage, les compteurs
        // étaient indépendants par événement, ce qui pouvait produire des taux
        // « % de l'étape préc. » incohérents (voire > 100 %). On garantit ici une
        // décroissance monotone et de vrais taux de conversion.
        const sessionsFor = (name) => new Set((events || []).filter(e => e.event_name === name).map(e => e.session_id));
        const visitSessions = new Set((toreViews || []).map(r => r.session_id));
        // Intersection cumulative : on ne garde que les sessions déjà présentes à l'étape précédente.
        const chain = (prevSet, curSet) => { const r = new Set(); for (const s of curSet) if (prevSet.has(s)) r.add(s); return r; };
        const sIntention = chain(visitSessions, sessionsFor('intention_saisie'));
        const sTirage    = chain(sIntention,    sessionsFor('tirage_lance'));
        const sAnalyse   = chain(sTirage,       sessionsFor('analyse_affichee'));
        const sEmail     = chain(sAnalyse,      sessionsFor('email_laisse'));
        funnel = {
          visites:            visitSessions.size,
          intentions_saisies: sIntention.size,
          tirages_lances:     sTirage.size,
          analyses_affichees: sAnalyse.size,
          emails_laisses:     sEmail.size,
          // Les abonnements viennent d'une autre table (tore_subscriptions) : la
          // souscription passe par une redirection Stripe qui perd le session_id,
          // donc cette étape n'est PAS chaînable par session — on la présente comme
          // une conversion de la période, pas comme un sous-ensemble des emails.
          abonnements:        newSubs || 0
        };
      } catch (_) { /* migration funnel_events pas encore exécutée — on omet simplement le funnel */ }

      // ── Conversions réelles de la période (précommandes, dons, inscriptions newsletter) ──
      const conversions = {};
      await Promise.all([
        sb.from('preorders').select('*', { count: 'exact', head: true }).gte('created_at', since)
          .then(({ count }) => { conversions.precommandes = count || 0; }, () => { conversions.precommandes = null; }),
        sb.from('donors').select('*', { count: 'exact', head: true }).gte('created_at', since)
          .then(({ count }) => { conversions.dons = count || 0; }, () => { conversions.dons = null; }),
        sb.from('newsletter_contacts').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('status', 'active')
          .then(({ count }) => { conversions.inscriptions_newsletter = count || 0; }, () => { conversions.inscriptions_newsletter = null; })
      ]);

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

Tunnel de conversion du tirage en ligne (visiteurs distincts à chaque étape) :
${funnel ? `- Visites de la page de tirage (tore.html) : ${funnel.visites}
- Intention saisie : ${funnel.intentions_saisies}
- Tirage lancé : ${funnel.tirages_lances}
- Analyse affichée : ${funnel.analyses_affichees}
- Email laissé : ${funnel.emails_laisses}
- Nouveaux abonnements Tore sur la période : ${funnel.abonnements}` : '- Données de tunnel indisponibles sur la période.'}

Conversions réelles de la période :
- Précommandes de l'oracle physique : ${conversions.precommandes == null ? 'N/A' : conversions.precommandes}
- Dons libres : ${conversions.dons == null ? 'N/A' : conversions.dons}
- Nouvelles inscriptions newsletter : ${conversions.inscriptions_newsletter == null ? 'N/A' : conversions.inscriptions_newsletter}

Santé technique (erreurs journalisées, pas forcément visibles par le visiteur) :
- Erreurs serveur (API) : ${serverErrors}
- Erreurs JavaScript côté client (bugs réellement rencontrés dans le navigateur) : ${clientErrors}
- Avertissements : ${warnings}

Analyse ces chiffres et donne-moi, en français, de façon concise et actionnable (utilise des puces, pas de blabla) :
1. Ce qui va bien
2. Ce qui est préoccupant ou à surveiller
3. 3 à 5 actions concrètes et priorisées pour améliorer le trafic et la conversion du site, en tenant compte du contexte (petit site indépendant, trafic encore faible, donc ne suggère pas d'analyses nécessitant un grand volume de données)

Consignes d'interprétation importantes :
- Le tunnel ci-dessus montre où les visiteurs décrochent : concentre les recommandations sur la plus grosse fuite entre deux étapes, pas sur des généralités.
- Ne confonds pas erreurs serveur et erreurs client : les erreurs serveur sont des incidents d'API (souvent invisibles pour le visiteur), les erreurs client sont des bugs JS vécus dans le navigateur (impact UX direct). Si les deux sont à 0 ou très faibles, ne dramatise pas une « catastrophe technique ».
- Priorise les actions sur les leviers déjà en place plutôt que d'en réinventer : le site a déjà un blog (SEO de contenu), des CTA en page d'accueil, et un suivi de conversion first-party. Ne recommande pas d'« ajouter Google Analytics / Pixel Facebook » ni d'« écrire des articles » sans vérifier ce qui existe déjà.

Sois honnête si les données sont trop limitées pour conclure quoi que ce soit de fiable — dans ce cas dis-le clairement plutôt que d'inventer des tendances. À ce volume de trafic, rappelle que le taux de rebond et le mix de canaux sont peu significatifs.`;

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

      // Le funnel et les conversions sont calculés plus haut (avant l'analyse IA)
      // pour être partagés entre la réponse GET et le prompt POST.
      if (req.method !== 'GET') return res.status(405).end();
      return res.status(200).json({
        success: true,
        range,
        traffic,
        funnel,
        conversions,
        logs_stats: { errors, server_errors: serverErrors, client_errors: clientErrors, warnings, total: (logs||[]).length }
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
        // Match insensible à la casse (voir endpoint /unsubscribe) : indispensable
        // pour que les désinscriptions de campagne Brevo remontent bien dans Supabase,
        // même si le contact y est stocké avec des majuscules.
        const emailPattern = email.replace(/[\\%_]/g, (c) => '\\' + c);
        const { error } = await sb.from('newsletter_contacts').update(updates).ilike('email', emailPattern);
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

