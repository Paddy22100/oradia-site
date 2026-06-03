// api/fenetre/index.js
// Routeur unifié pour la fenêtre d'observation
// POST /api/fenetre/activation  → active une fenêtre + email immédiat
// POST /api/fenetre/close        → cron : envoie emails de clôture

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = 'oracle@oradia.fr';
const FROM_NAME = 'Oracle Oradia';

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'https://oradia.fr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function setCORS(res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
}

// ============ ACTIVATION ============
async function handleActivation(req, res) {
  let body;
  try {
    body = typeof req.json === 'function' ? await req.json() : JSON.parse(await streamToString(req));
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid JSON' });
  }

  const { email, intention, cards, attentionPoints, durationDays, observationText } = body;

  if (!email || !durationDays) {
    return res.status(400).json({ success: false, message: 'email et durationDays requis' });
  }

  const closesAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  // 1. Stocker dans Supabase
  const { data: row, error } = await supabase
    .from('observation_windows')
    .insert({
      email,
      intention: intention || '',
      cards: cards || [],
      attention_points: attentionPoints || [],
      duration_days: durationDays,
      closes_at: closesAt.toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[fenetre] Supabase error:', error);
    return res.status(500).json({ success: false, message: 'Erreur de stockage' });
  }

  // 2. Email de confirmation immédiat via Brevo
  const closesAtFR = closesAt.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(durationDays >= 3 ? { hour: '2-digit', minute: '2-digit' } : {})
  });

  const attentionHTML = (attentionPoints || [])
    .map(p => `<li style="margin-bottom:10px;color:#e9e7df;line-height:1.7;">${escapeHtml(p)}</li>`)
    .join('');

  const emailHTML = buildActivationEmail({ email, intention, observationText, attentionPoints, durationDays, closesAtFR, attentionHTML });

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email }],
        subject: `Votre fenêtre d'observation est ouverte — ${durationDays} jour${durationDays > 1 ? 's' : ''}`,
        htmlContent: emailHTML,
      }),
    });

    await supabase
      .from('observation_windows')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', row.id);

  } catch (emailErr) {
    console.error('[fenetre] Brevo error:', emailErr);
  }

  return res.status(200).json({ success: true, closesAt: closesAt.toISOString() });
}

// ============ CLOSE (CRON) ============
async function handleClose(req, res) {
  // Sécurité : accepter uniquement les appels Vercel Cron ou un token admin
  const authHeader = req.headers['authorization'] || '';
  if (
    req.headers['x-vercel-cron'] !== '1' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Récupérer les fenêtres arrivées à terme, email de clôture non envoyé
  const { data: windows, error } = await supabase
    .from('observation_windows')
    .select('*')
    .lte('closes_at', new Date().toISOString())
    .is('closing_email_sent_at', null)
    .limit(20);

  if (error) {
    console.error('[fenetre] Supabase error:', error);
    return res.status(500).json({ error: error.message });
  }

  if (!windows || windows.length === 0) {
    return res.status(200).json({ processed: 0 });
  }

  let sent = 0;
  for (const win of windows) {
    try {
      const emailHTML = buildClosingEmail(win);

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: win.email }],
          subject: `Votre fenêtre d'observation se referme — qu'avez-vous perçu ?`,
          htmlContent: emailHTML,
        }),
      });

      await supabase
        .from('observation_windows')
        .update({ closing_email_sent_at: new Date().toISOString() })
        .eq('id', win.id);

      sent++;
    } catch (err) {
      console.error(`[fenetre] Failed for ${win.email}:`, err.message);
    }
  }

  return res.status(200).json({ processed: sent });
}

// ============ EMAIL TEMPLATES ============
function buildActivationEmail({ intention, observationText, attentionPoints, durationDays, closesAtFR, attentionHTML }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a192f;font-family:'Georgia',serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <img src="https://oradia.fr/images/logo-hd-v2.jpeg"
           alt="Oradia" style="width:64px;height:64px;border-radius:50%;border:2px solid rgba(212,175,55,0.4);">
      <p style="color:rgba(212,175,55,0.6);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:12px 0 0;">Oracle Oradia</p>
    </div>
    <h1 style="font-family:'Georgia',serif;font-size:26px;color:#d4af37;text-align:center;margin:0 0 8px;font-weight:normal;">Votre fenêtre d'observation</h1>
    <p style="text-align:center;color:rgba(212,175,55,0.5);font-size:13px;margin:0 0 28px;">est ouverte pour ${durationDays} jour${durationDays > 1 ? 's' : ''}</p>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4),transparent);margin-bottom:28px;"></div>
    ${intention ? `
    <div style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 8px;">Votre intention</p>
      <p style="color:#f5e7a1;font-style:italic;font-size:15px;line-height:1.6;margin:0;">"${escapeHtml(intention)}"</p>
    </div>` : ''}
    ${observationText ? `
    <div style="margin-bottom:24px;">
      <p style="color:#e9e7df;font-size:14px;line-height:1.8;">${escapeHtml(observationText).replace(/\n/g, '<br>')}</p>
    </div>` : ''}
    ${attentionPoints && attentionPoints.length > 0 ? `
    <div style="background:rgba(5,20,40,0.8);border:1px solid rgba(212,175,55,0.25);border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <p style="color:#d4af37;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 14px;">Points d'attention pour ces ${durationDays} jour${durationDays > 1 ? 's' : ''}</p>
      <ul style="margin:0;padding-left:18px;">${attentionHTML}</ul>
    </div>` : ''}
    <div style="text-align:center;margin-bottom:28px;">
      <p style="color:rgba(212,175,55,0.6);font-size:13px;margin:0;">Vous recevrez un message de clôture le</p>
      <p style="color:#d4af37;font-size:15px;font-weight:bold;margin:4px 0 0;">${closesAtFR}</p>
    </div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.2),transparent);margin-bottom:24px;"></div>
    <p style="color:rgba(212,175,55,0.35);font-size:11px;text-align:center;line-height:1.6;margin:0;">Ce message vous a été envoyé par Oracle Oradia suite à votre tirage.<br><a href="https://oradia.fr" style="color:rgba(212,175,55,0.5);">oradia.fr</a></p>
  </div>
</body>
</html>`;
}

function buildClosingEmail(win) {
  const attentionHTML = (win.attention_points || [])
    .map(p => `<li style="margin-bottom:10px;color:#e9e7df;line-height:1.7;">${escapeHtml(p)}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a192f;font-family:'Georgia',serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <img src="https://oradia.fr/images/logo-hd-v2.jpeg"
           alt="Oradia" style="width:64px;height:64px;border-radius:50%;border:2px solid rgba(212,175,55,0.4);">
    </div>
    <h1 style="font-family:'Georgia',serif;font-size:24px;color:#d4af37;text-align:center;margin:0 0 8px;font-weight:normal;">Votre fenêtre se referme</h1>
    <p style="text-align:center;color:rgba(212,175,55,0.6);font-size:14px;margin:0 0 28px;font-style:italic;">Ces ${win.duration_days} jour${win.duration_days > 1 ? 's' : ''} touchent à leur fin.</p>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4),transparent);margin-bottom:28px;"></div>
    ${win.intention ? `<p style="color:#f5e7a1;font-style:italic;font-size:15px;line-height:1.6;text-align:center;margin:0 0 24px;">"${escapeHtml(win.intention)}"</p>` : ''}
    <p style="color:#e9e7df;font-size:14px;line-height:1.8;margin:0 0 20px;">Voici quelques questions pour clore cette fenêtre avec conscience :</p>
    <div style="background:rgba(212,175,55,0.06);border-left:3px solid rgba(212,175,55,0.4);padding:16px 20px;margin-bottom:24px;">
      <p style="color:#f5e7a1;font-size:14px;line-height:1.8;margin:0 0 10px;font-style:italic;">Qu'est-ce qui a résonné, même discrètement, pendant ces jours ?</p>
      <p style="color:#f5e7a1;font-size:14px;line-height:1.8;margin:0 0 10px;font-style:italic;">Y a-t-il eu une conversation, une image, un moment qui a fait écho à votre intention ?</p>
      <p style="color:#f5e7a1;font-size:14px;line-height:1.8;margin:0;font-style:italic;">Si rien d'apparent n'est apparu — qu'est-ce qui, en vous, a peut-être bougé ?</p>
    </div>
    ${attentionHTML ? `<div style="background:rgba(5,20,40,0.8);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:18px 22px;margin-bottom:24px;"><p style="color:#d4af37;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 12px;">Vous observiez</p><ul style="margin:0;padding-left:18px;">${attentionHTML}</ul></div>` : ''}
    <div style="text-align:center;margin-bottom:28px;">
      <a href="https://oradia.fr/tore.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#051428;font-family:'Georgia',serif;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:50px;text-decoration:none;">Faire un nouveau tirage</a>
    </div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.2),transparent);margin-bottom:24px;"></div>
    <p style="color:rgba(212,175,55,0.35);font-size:11px;text-align:center;line-height:1.6;margin:0;">Oracle Oradia · <a href="https://oradia.fr" style="color:rgba(212,175,55,0.5);">oradia.fr</a></p>
  </div>
</body>
</html>`;
}

// ============ UTILITAIRES ============
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

// ============ ROUTEUR PRINCIPAL ============
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.url?.split('?')[0] || '';

  try {
    if (path === '/activation' || path === '/activation/') {
      if (req.method !== 'POST') return res.status(405).json({ success: false });
      return await handleActivation(req, res);
    }

    if (path === '/close' || path === '/close/') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      return await handleClose(req, res);
    }

    return res.status(404).json({ success: false, error: 'Route non trouvée' });
  } catch (err) {
    console.error('[fenetre] Error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}
