// api/fenetre/index.js
// Routeur unifié pour la fenêtre d'observation
// POST /api/fenetre/activation  → active une fenêtre + email immédiat
// POST /api/fenetre/close        → cron : envoie emails de clôture
// POST /api/fenetre/survey       → reçoit le questionnaire de synchronicité

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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function setCORS(res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
}

// ============ ACTIVATION ============
async function handleActivation(req, res) {
  let body;
  try {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (req.body && typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (typeof req.json === 'function') {
      body = await req.json();
    } else {
      body = JSON.parse(await streamToString(req));
    }
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid JSON' });
  }

  const { email, intention, cards, attentionPoints, durationDays, observationText, qrngSource } = body;

  if (!email || !durationDays) {
    return res.status(400).json({ success: false, message: 'email et durationDays requis' });
  }

  // Normaliser la source du tirage : 'anu' (quantique pur) sinon 'fallback'.
  // Seuls les tirages 'anu' sont valides pour l'étude scientifique.
  const normalizedQrngSource = qrngSource === 'anu' ? 'anu' : 'fallback';

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
      qrng_source: normalizedQrngSource,
      // response_token généré automatiquement par la DB (DEFAULT gen_random_uuid())
    })
    .select('id')
    .single();

  if (error) {
    console.error('[fenetre] Supabase error:', error);
    return res.status(500).json({ success: false, message: 'Erreur de stockage' });
  }

  // 2. Plus d'email séparé - les données seront envoyées avec l'email du tirage
  // La fenêtre d'observation est maintenant incluse dans l'email complet du tirage
  // Note : response_token disponible après migration supabase-migration-synchronicity.sql

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

  // Récupérer les fenêtres arrivées à terme dans les 48 dernières heures, email non envoyé.
  // Le filtre gte(closes_at, cutoff) évite d'envoyer rétroactivement aux anciennes fenêtres.
  const now = new Date();
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const { data: windows, error } = await supabase
    .from('observation_windows')
    .select('*, response_token')
    .lte('closes_at', now.toISOString())
    .gte('closes_at', cutoff48h)
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
      // response_token disponible seulement après migration synchronicity
      const emailHTML = buildClosingEmail(win, win.response_token || null);

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: win.email }],
          subject: `Rudy d'Oradia - Votre fenêtre d'observation se referme — qu'avez-vous perçu ?`,
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

// ============ SURVEY ============
async function handleSurvey(req, res) {
  let body;
  try {
    if (req.body && typeof req.body === 'object') body = req.body;
    else if (req.body && typeof req.body === 'string') body = JSON.parse(req.body);
    else if (typeof req.json === 'function') body = await req.json();
    else body = JSON.parse(await streamToString(req));
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid JSON' });
  }

  const { token, score, types, resonance, etat, temoignage } = body;

  if (!token || !score) {
    return res.status(400).json({ success: false, message: 'token et score requis' });
  }

  // Vérifier que le token existe et récupérer l'observation_window_id
  const { data: win, error: winErr } = await supabase
    .from('observation_windows')
    .select('id, response_token')
    .eq('response_token', token)
    .single();

  if (winErr || !win) {
    return res.status(404).json({ success: false, message: 'Token invalide ou expiré' });
  }

  // Insérer les réponses (upsert : si déjà répondu on met à jour)
  const { error: insertErr } = await supabase
    .from('synchronicity_responses')
    .upsert({
      response_token:        token,
      observation_window_id: win.id,
      score_synchronicites:  parseInt(score, 10),
      types_synchronicites:  Array.isArray(types) ? types : [],
      resonance_tirage:      resonance || null,
      etat_interieur:        etat || null,
      temoignage:            temoignage || null,
    }, { onConflict: 'response_token' });

  if (insertErr) {
    console.error('[fenetre/survey] Supabase error:', insertErr);
    return res.status(500).json({ success: false, message: 'Erreur de stockage' });
  }

  return res.status(200).json({ success: true });
}

// ============ EMAIL TEMPLATES ============
// Plus d'email d'activation - les données sont incluses dans l'email du tirage

function buildClosingEmail(win, responseToken) {
  const attentionHTML = (win.attention_points || [])
    .map(p => `<li style="margin-bottom:10px;color:#e9e7df;line-height:1.7;">${escapeHtml(p)}</li>`)
    .join('');

  // Gabarit recalqué sur le design désormais commun aux emails ORADIA
  // (mail d'analyse / confirmations / bienvenue) — Palier 3 #17 :
  // structure en <table> pleine largeur, fond dégradé #0a1628→#051428,
  // bordure dorée fine, image d'en-tête, polices Cormorant Garamond + Lora.
  return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;width:100%;background:#050a14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;background:#050a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:48px 20px;">

        <!-- Container principal -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(135deg, #0a1628 0%, #051428 100%);border:1px solid rgba(212,175,55,0.3);box-shadow:0 8px 32px rgba(0,0,0,0.4);">

          <!-- Header avec image -->
          <tr>
            <td align="center" style="padding:0;position:relative;">
              <div style="position:relative;width:100%;height:200px;overflow:hidden;">
                <img src="https://oradia.fr/images/medias/bandeau_mail_fenetre_observation.png" alt="Fenêtre d'observation — ORADIA" width="600" style="display:block;width:100%;height:auto;max-height:220px;object-fit:cover;border:0;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg, rgba(5,10,20,0) 0%, rgba(5,10,20,0.95) 100%);"></div>
              </div>
            </td>
          </tr>

          <!-- Titre principal -->
          <tr>
            <td align="center" style="padding:32px 40px 24px 40px;">
              <h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:300;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">
                Votre fenêtre se referme
              </h1>
              <div style="width:60px;height:1px;background:linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);margin:20px auto;"></div>
              <p style="margin:0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:15px;font-style:italic;line-height:1.6;letter-spacing:0.5px;">
                Ces ${win.duration_days} jour${win.duration_days > 1 ? 's' : ''} touchent à leur fin
              </p>
            </td>
          </tr>

          <!-- Corps du message -->
          <tr>
            <td style="padding:0 40px 32px 40px;">

              ${win.intention ? `<p style="margin:0 0 28px 0;color:#f5e7a1;font-family:'Lora',Georgia,serif;font-style:italic;font-size:15px;line-height:1.7;text-align:center;">«&nbsp;${escapeHtml(win.intention)}&nbsp;»</p>` : ''}

              <p style="margin:0 0 20px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                Voici quelques questions pour clore cette fenêtre avec conscience :
              </p>

              <!-- Encadré questions -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:rgba(17,24,43,0.6);border-left:3px solid #d4af37;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px 0;color:#f5e7a1;font-family:'Lora',Georgia,serif;font-size:14px;line-height:1.8;font-style:italic;">Qu'est-ce qui a résonné, même discrètement, pendant ces jours&nbsp;?</p>
                    <p style="margin:0 0 12px 0;color:#f5e7a1;font-family:'Lora',Georgia,serif;font-size:14px;line-height:1.8;font-style:italic;">Y a-t-il eu une conversation, une image, un moment qui a fait écho à votre intention&nbsp;?</p>
                    <p style="margin:0;color:#f5e7a1;font-family:'Lora',Georgia,serif;font-size:14px;line-height:1.8;font-style:italic;">Si rien d'apparent n'est apparu — qu'est-ce qui, en vous, a peut-être bougé&nbsp;?</p>
                  </td>
                </tr>
              </table>

              ${attentionHTML ? `
              <!-- Encadré "Vous observiez" -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;background:rgba(5,10,20,0.6);border:1px solid rgba(212,175,55,0.2);">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;color:#d4af37;font-family:'Lora',Georgia,serif;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Vous observiez</p>
                    <ul style="margin:0;padding-left:18px;">${attentionHTML}</ul>
                  </td>
                </tr>
              </table>` : ''}

              <!-- CTA Questionnaire synchronicité -->
              ${responseToken ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background:rgba(17,24,43,0.7);border:1px solid rgba(212,175,55,0.25);padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 14px;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:14px;line-height:1.7;">
                      Vos observations ont de la valeur. En répondant à 5 questions rapides,<br>vous contribuez à une étude sur les synchronicités et la rétrocausalité.
                    </p>
                    <a href="https://oradia.fr/synchronicite.html?token=${responseToken}" style="display:inline-block;background:linear-gradient(135deg, #1a3a6e 0%, #2a5298 100%);color:#f5e7a1;font-family:'Lora',Georgia,serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:4px;letter-spacing:0.5px;border:1px solid rgba(100,149,237,0.4);">
                      Partager mon vécu (5 min)
                    </a>
                    <p style="margin:12px 0 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:11px;font-style:italic;">
                      Anonyme · Aucune donnée personnelle n'est stockée
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- CTA Nouveau tirage -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 32px;">
                <tr>
                  <td align="center" style="padding:0;">
                    <a href="https://oradia.fr/tore.html" style="display:inline-block;background:linear-gradient(135deg, #d4af37 0%, #f0c75e 100%);color:#0a1628;font-family:'Lora',Georgia,serif;font-size:15px;font-weight:600;text-decoration:none;padding:16px 32px;border-radius:4px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(212,175,55,0.3);">
                      Faire un nouveau tirage
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Séparateur -->
              <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.3) 50%, transparent 100%);margin:0 0 32px 0;"></div>

              <p style="margin:0 0 8px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:14px;line-height:1.8;">
                Avec gratitude,
              </p>
              <p style="margin:0;color:#d8bf72;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:600;letter-spacing:1px;">
                Rudy Boucheron
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:rgba(5,10,20,0.6);border-top:1px solid rgba(212,175,55,0.2);">
              <p style="margin:0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:11px;text-align:center;line-height:1.6;">
                <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a> · <a href="mailto:contact@oradia.fr" style="color:#d4af37;text-decoration:none;">contact@oradia.fr</a><br>
                ORADIA – La Boussole Intérieure · Révéler. Transmuter. Relier.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
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
    if (path.includes('activation')) {
      if (req.method !== 'POST') return res.status(405).json({ success: false });
      return await handleActivation(req, res);
    }

    if (path.includes('close')) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      return await handleClose(req, res);
    }

    if (path.includes('survey')) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      return await handleSurvey(req, res);
    }

    // GET /api/fenetre/window?token=<uuid>
    // Retourne les données publiques de la fenêtre (cards, intention, duration_days) sans email
    if (path.includes('window') && req.method === 'GET') {
      const token = new URL(req.url, 'https://oradia.fr').searchParams.get('token');
      if (!token) return res.status(400).json({ error: 'Token requis' });
      const { data: win, error } = await supabase
        .from('observation_windows')
        .select('cards, intention, duration_days, closes_at, attention_points')
        .eq('response_token', token)
        .maybeSingle();
      if (error || !win) return res.status(404).json({ error: 'Fenêtre introuvable' });
      return res.status(200).json({ success: true, window: win });
    }

    // POST /api/fenetre/test-preview → envoie un mail de clôture de test à contact@oradia.fr
    if (path.includes('test-preview')) {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
        return res.status(401).json({ error: 'Non autorisé' });
      }
      const testWin = {
        email: 'contact@oradia.fr',
        duration_days: 14,
        closes_at: new Date().toISOString(),
        intention: 'Trouver ma voie professionnelle et oser ce changement',
        attention_points: ['Les signes liés à un changement de direction', 'Les rencontres ou conversations inattendues', 'Les rêves et images récurrentes']
      };
      const emailHTML = buildClosingEmail(testWin, 'TOKEN-TEST-EXEMPLE-1234');
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: 'contact@oradia.fr' }],
          subject: '[TEST] Votre fenêtre d\'observation se referme — qu\'avez-vous perçu ?',
          htmlContent: emailHTML
        })
      });
      if (!brevoRes.ok) { const t = await brevoRes.text(); throw new Error(`Brevo ${brevoRes.status}: ${t}`); }
      return res.status(200).json({ success: true, sentTo: 'contact@oradia.fr' });
    }

    return res.status(404).json({ success: false, error: 'Route non trouvée' });
  } catch (err) {
    console.error('[fenetre] Error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}
