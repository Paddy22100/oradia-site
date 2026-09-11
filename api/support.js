// api/support.js
// Endpoint pour envoyer les messages de support, témoignages et suggestions
// Utilise Brevo pour envoyer les emails à contact@oradia.fr
// + stockage dans Supabase (table support_messages) pour le dashboard admin

import { createClient } from '@supabase/supabase-js';
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const TO_EMAIL = 'contact@oradia.fr';
const FROM_EMAIL = 'oracle@oradia.fr';
const FROM_NAME = 'Oracle Oradia';

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'https://oradia.fr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function setCORS(res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
}

function getSubjectAndTitle(type, data) {
  switch (type) {
    case 'support':
      return {
        subject: `[Support Oradia] ${data.sujet || 'Contact'}`,
        title: 'Nouveau message de support'
      };
    case 'temoignage':
      return {
        subject: `[Témoignage Oradia] Retour d'expérience`,
        title: 'Nouveau témoignage'
      };
    case 'suggestion':
      return {
        subject: `[Suggestion Oradia] ${data.categorie || 'Idée'}`,
        title: 'Nouvelle suggestion'
      };
    default:
      return {
        subject: '[Oradia] Message',
        title: 'Nouveau message'
      };
  }
}

function buildEmailHTML(type, data) {
  const { title } = getSubjectAndTitle(type, data);
  
  let detailsHTML = '';
  if (type === 'support' && data.sujet) {
    detailsHTML += `<p style="margin:4px 0;color:#e9e7df;font-family:Georgia,serif;font-size:14px;"><strong>Sujet :</strong> ${escapeHtml(data.sujet)}</p>`;
  }
  if (type === 'suggestion' && data.categorie) {
    const catLabels = {
      'ux': 'Interface / Expérience utilisateur',
      'tirage': 'Nouveaux types de tirages',
      'contenu': 'Contenu des interprétations',
      'fonctionnalite': 'Nouvelle fonctionnalité',
      'autre': 'Autre'
    };
    detailsHTML += `<p style="margin:4px 0;color:#e9e7df;font-family:Georgia,serif;font-size:14px;"><strong>Catégorie :</strong> ${escapeHtml(catLabels[data.categorie] || data.categorie)}</p>`;
  }
  if (type === 'temoignage' && data.publication) {
    const pubLabels = {
      'anonyme': 'Publication anonyme',
      'prenom': 'Publication avec prénom',
      'non': 'Ne pas publier'
    };
    detailsHTML += `<p style="margin:4px 0;color:#e9e7df;font-family:Georgia,serif;font-size:14px;"><strong>Autorisation :</strong> ${escapeHtml(pubLabels[data.publication] || data.publication)}</p>`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#0a192f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a192f" style="background-color:#0a192f;">
    <tr>
      <td align="center" style="padding:40px 24px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;" bgcolor="#0a192f">
          <tr>
            <td align="center" style="padding:0 0 32px;">
              <img src="https://oradia.fr/images/logo-hd-v2.jpeg"
                   alt="Oradia" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:50%;border:2px solid #6b5b28;">
              <p style="margin:12px 0 0;color:#d4af37;font-family:Georgia,serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">
                ${title}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#162230" style="background-color:#162230;border:1px solid #3a3020;border-radius:12px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;color:#d4af37;font-family:Georgia,serif;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">
                      Informations
                    </p>
                    <p style="margin:4px 0;color:#e9e7df;font-family:Georgia,serif;font-size:14px;"><strong>De :</strong> ${escapeHtml(data.name || 'Anonyme')} (${escapeHtml(data.email || 'non fourni')})</p>
                    <p style="margin:4px 0;color:#e9e7df;font-family:Georgia,serif;font-size:14px;"><strong>Type :</strong> ${escapeHtml(type)}</p>
                    ${detailsHTML}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#061529" style="background-color:#061529;border:1px solid #3a3020;border-radius:12px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 14px;color:#d4af37;font-family:Georgia,serif;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">
                      Message
                    </p>
                    <p style="margin:0;color:#e9e7df;font-family:Georgia,serif;font-size:15px;line-height:1.8;white-space:pre-wrap;">${escapeHtml(data.message || '')}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3020" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:16px 0 0;">
              <p style="margin:0;color:#8a7a52;font-family:Georgia,serif;font-size:11px;text-align:center;line-height:1.6;">
                Envoyé depuis l'espace membre Oradia<br>
                <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a>
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

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Stockage Supabase non-bloquant — indépendant de l'envoi email
async function saveToSupabase({ type, email, name, sujet, categorie, publication, message }) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from('support_messages').insert({
      type: type || 'support',
      email,
      name: name || null,
      sujet: sujet || null,
      categorie: categorie || null,
      publication: publication || null,
      message,
      status: 'new'
    });
    if (error) console.error('[Support] Supabase insert error:', error.message);
    else console.log('[Support] Message sauvegardé en BDD:', type, 'de', email);
  } catch (err) {
    console.error('[Support] Supabase exception:', err.message);
  }
}

export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let body;
  try {
    body = typeof req.json === 'function' ? await req.json() : JSON.parse(await streamToString(req));
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON' });
  }

  const { type, message, email, name, sujet, categorie, publication } = body;

  if (!message || !email) {
    return res.status(400).json({ success: false, error: 'Message et email requis' });
  }

  // Stocker en BDD (non-bloquant — ne fait pas échouer la requête si ça plante)
  saveToSupabase({ type, email, name, sujet, categorie, publication, message });

  if (!BREVO_API_KEY) {
    // Pas d'email possible mais le message est déjà en BDD
    console.warn('[Support] BREVO_API_KEY manquante — message stocké en BDD uniquement');
    return res.status(200).json({ success: true, emailSent: false });
  }

  const { subject } = getSubjectAndTitle(type, { sujet, categorie });
  const emailHTML = buildEmailHTML(type, { message, email, name, sujet, categorie, publication });

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: TO_EMAIL }],
        replyTo: { email, name: name || email.split('@')[0] },
        subject,
        htmlContent: emailHTML,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Support] Brevo error:', error);
      // Message déjà en BDD — on répond quand même OK
      return res.status(200).json({ success: true, emailSent: false });
    }

    console.log('[Support] Email envoyé:', type, 'de', email);
    return res.status(200).json({ success: true, emailSent: true });

  } catch (err) {
    console.error('[Support] Erreur envoi:', err.message);
    return res.status(200).json({ success: true, emailSent: false });
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}
