// api/support.js
// Endpoint pour envoyer les messages de support, témoignages et suggestions
// Utilise Brevo pour envoyer les emails à contact@oradia.fr

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
    detailsHTML += `<p><strong>Sujet :</strong> ${escapeHtml(data.sujet)}</p>`;
  }
  if (type === 'suggestion' && data.categorie) {
    const catLabels = {
      'ux': 'Interface / Expérience utilisateur',
      'tirage': 'Nouveaux types de tirages',
      'contenu': 'Contenu des interprétations',
      'fonctionnalite': 'Nouvelle fonctionnalité',
      'autre': 'Autre'
    };
    detailsHTML += `<p><strong>Catégorie :</strong> ${escapeHtml(catLabels[data.categorie] || data.categorie)}</p>`;
  }
  if (type === 'temoignage' && data.publication) {
    const pubLabels = {
      'anonyme': 'Publication anonyme',
      'prenom': 'Publication avec prénom',
      'non': 'Ne pas publier'
    };
    detailsHTML += `<p><strong>Autorisation :</strong> ${escapeHtml(pubLabels[data.publication] || data.publication)}</p>`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a192f;font-family:'Georgia',serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <img src="https://oradia.fr/images/logo-hd-v2.jpeg"
           alt="Oradia" style="width:64px;height:64px;border-radius:50%;border:2px solid rgba(212,175,55,0.4);">
      <p style="color:rgba(212,175,55,0.6);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:12px 0 0;">
        ${title}
      </p>
    </div>
    
    <div style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <p style="color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 12px;">
        Informations
      </p>
      <p style="color:#e9e7df;margin:4px 0;"><strong>De :</strong> ${escapeHtml(data.name || 'Anonyme')} (${escapeHtml(data.email || 'non fourni')})</p>
      <p style="color:#e9e7df;margin:4px 0;"><strong>Type :</strong> ${escapeHtml(type)}</p>
      ${detailsHTML}
    </div>
    
    <div style="background:rgba(5,20,40,0.8);border:1px solid rgba(212,175,55,0.25);border-radius:12px;padding:20px 24px;">
      <p style="color:#d4af37;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 14px;">
        Message
      </p>
      <p style="color:#e9e7df;line-height:1.8;white-space:pre-wrap;">${escapeHtml(data.message || '')}</p>
    </div>
    
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.2),transparent);margin:24px 0;"></div>
    
    <p style="color:rgba(212,175,55,0.35);font-size:11px;text-align:center;line-height:1.6;margin:0;">
      Envoyé depuis l'espace membre Oradia<br>
      <a href="https://oradia.fr" style="color:rgba(212,175,55,0.5);">oradia.fr</a>
    </p>
  </div>
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

  if (!BREVO_API_KEY) {
    console.error('[Support] BREVO_API_KEY manquante');
    return res.status(500).json({ success: false, error: 'Configuration serveur manquante' });
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
      throw new Error('Brevo API error');
    }

    console.log('[Support] Email envoyé:', type, 'de', email);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Support] Erreur envoi:', err.message);
    return res.status(500).json({ success: false, error: 'Erreur envoi email' });
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
