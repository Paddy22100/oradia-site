// api/admin/newsletter.js
// Route unifiée newsletter — remplace les 5 fichiers séparés pour rester dans la limite Vercel Hobby (12 fonctions)
// Usage : /api/admin/newsletter?action=generate|ideas|save|send|drafts

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Auth (cookie JWT — même mécanisme que _auth.js) ───────────────────────────
function checkAuth(req, res) {
  try {
    const cookies = parseCookie(req.headers.cookie || '');
    const token = cookies.oradia_admin_session;
    if (!token) { res.status(401).json({ error: 'Non autorisé' }); return false; }
    const decoded = jwt.verify(token, process.env.ADMIN_SESSION_SECRET);
    if (decoded.type !== 'admin') { res.status(401).json({ error: 'Non autorisé' }); return false; }
    return true;
  } catch (e) {
    res.status(401).json({ error: 'Non autorisé' });
    return false;
  }
}

// ── textToHtml (pour l'envoi Brevo) ──────────────────────────────────────────
function textToHtml(text) {
  const lines = text.split('\n');
  let bodyHtml = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { bodyHtml += '<tr><td style="padding:6px 0;"></td></tr>'; continue; }
    // Titres de section en MAJUSCULES (ex: "RÉFLEXION :", "OBJET :")
    if (/^[A-ZÀÂÉÈÊËÎÏÔÙÛÜ][A-ZÀÂÉÈÊËÎÏÔÙÛÜ\s\u00C0-\u00FF]{2,}\s*:/.test(trimmed)) {
      bodyHtml += `<tr><td style="padding:28px 0 10px 0;">
        <p style="margin:0;font-family:Georgia,serif;font-size:10px;letter-spacing:3px;color:#d4af37;text-transform:uppercase;font-weight:600;">${trimmed}</p>
        <div style="width:32px;height:1px;background:#d4af37;margin-top:8px;opacity:0.6;"></div>
      </td></tr>`;
      continue;
    }
    // Lien oradia.fr (→ oradia.fr)
    if (trimmed.startsWith('→')) {
      bodyHtml += `<tr><td style="padding:20px 0 8px 0;text-align:center;">
        <a href="https://oradia.fr" style="display:inline-block;color:#d4af37;font-family:Georgia,serif;font-size:13px;letter-spacing:2px;text-decoration:none;text-transform:uppercase;border-bottom:1px solid rgba(212,175,55,0.4);padding-bottom:3px;">${trimmed}</a>
      </td></tr>`;
      continue;
    }
    // Séparateurs ---
    if (/^-{3,}$/.test(trimmed)) {
      bodyHtml += `<tr><td style="padding:16px 0;">
        <div style="width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.3),transparent);"></div>
      </td></tr>`;
      continue;
    }
    // Texte en italique *...*
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      bodyHtml += `<tr><td style="padding:12px 0;">
        <p style="margin:0;font-family:Georgia,serif;font-size:16px;line-height:1.8;color:#f0c75e;font-style:italic;">${trimmed.slice(2,-2)}</p>
      </td></tr>`;
      continue;
    }
    if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
      bodyHtml += `<tr><td style="padding:8px 0 8px 20px;border-left:2px solid rgba(212,175,55,0.5);">
        <p style="margin:0;font-family:Georgia,serif;font-size:15px;line-height:1.9;color:#d8bf72;font-style:italic;">${trimmed.slice(1,-1)}</p>
      </td></tr>`;
      continue;
    }
    // Paragraphe normal
    bodyHtml += `<tr><td style="padding:6px 0;">
      <p style="margin:0;font-family:Georgia,serif;font-size:15px;line-height:1.9;color:#d1d5db;">${trimmed}</p>
    </td></tr>`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#050a14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(135deg,#0a1628 0%,#051428 100%);border:1px solid rgba(212,175,55,0.3);box-shadow:0 8px 32px rgba(0,0,0,0.4);">

          <!-- Header image -->
          <tr>
            <td align="center" style="padding:0;position:relative;">
              <div style="position:relative;width:100%;height:200px;overflow:hidden;">
                <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oradia" width="600" style="display:block;width:100%;height:200px;object-fit:cover;border:0;opacity:0.7;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg,rgba(5,10,20,0) 0%,rgba(5,10,20,0.97) 100%);"></div>
              </div>
            </td>
          </tr>

          <!-- Titre -->
          <tr>
            <td align="center" style="padding:32px 40px 24px 40px;">
              <p style="margin:0;font-family:Georgia,serif;font-size:10px;letter-spacing:4px;color:#d4af37;text-transform:uppercase;">La Boussole Intérieure</p>
              <h1 style="margin:12px 0 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:300;color:#f0c75e;letter-spacing:2px;line-height:1.2;">La lettre du vivant</h1>
              <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:20px auto 0;"></div>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td style="padding:8px 48px 40px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bodyHtml}
              </table>
            </td>
          </tr>

          <!-- Séparateur -->
          <tr>
            <td align="center" style="padding:0 40px;">
              <div style="width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.3),transparent);"></div>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td align="center" style="padding:36px 40px 48px 40px;">
              <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:13px;color:#9ca3af;font-style:italic;">Avec toute ma gratitude,</p>
              <p style="margin:0 0 4px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;color:#f0c75e;letter-spacing:1px;">Rudy</p>
              <p style="margin:0 0 20px 0;font-family:Georgia,serif;font-size:13px;color:#d8bf72;font-style:italic;">La Boussole Intérieure</p>
              <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-family:Georgia,serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid rgba(212,175,55,0.4);padding-bottom:2px;">oradia.fr</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:rgba(5,10,20,0.6);border-top:1px solid rgba(212,175,55,0.15);">
              <p style="margin:0;font-family:Georgia,serif;font-size:11px;color:#6b7280;text-align:center;line-height:1.7;">
                Vous recevez cette lettre parce que vous êtes abonné à <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a><br>
                <a href="{{unsubscribe}}" style="color:#6b7280;text-decoration:underline;">Se désinscrire</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

// ── Prompt Claude ─────────────────────────────────────────────────────────────
const LIVRE_BOUSSOLE = `LIVRE 1 — "La Boussole Intérieure" (essai)
Thèmes : Âme / Esprit / Corps / Conscience, PNEI, mémoire implicite, trauma, fascias,
fenêtre de tolérance, vulnérabilité, HPI/Sentinelle, partition de famille, transgénérationnel.
Métaphore centrale : Le poste de radio. L'Âme émet, l'Esprit reçoit et filtre, le Corps retransmet,
la Conscience observe et peut ajuster.
Concepts clés :
- Le dragon (l'Esprit non accordé) vs l'archange (la Conscience qui le remet à sa place)
- La mémoire implicite n'a pas de date : elle vit au présent comme si le danger était encore là
- La vulnérabilité n'est pas une faiblesse — c'est le sol meuble où les racines s'ancrent
- La fenêtre de tolérance (Dan Siegel) : ni trop activé, ni trop éteint — c'est là que la guérison est possible
- L'oracle crée une brèche synaptique : il hack le système de sécurité de l'Esprit
- L'adaptome : ensemble des stratégies adaptatives construites face à un environnement inadéquat.`;

const LIVRE_ROMAN = `LIVRE 2 — Roman initiatique (Le Pèlerin)
Thèmes : biomimétisme, lois du Vivant, modèle RLC (Résistance / Inductance / Capacité), résonance, synchronicité.
Figures rencontrées :
- Le Vieux Chêne : "Je ne tiens pas : je me tiens." — La résistance juste n'est pas rigidité.
- La Fileuse des Spires : l'inductance, la mémoire lente du vivant.
- Le Musicien des Vibrations : la note juste, la résonance, trouver sa fréquence propre.
- Le Guérisseur du Choc : "Le choc détruit seulement ce qui devait mourir. Il réveille ce qui voulait vivre."
Phrase centrale : "Le vivant ne supporte pas longtemps de ne pas être ce qu'il est."`;

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;

  const action = req.query.action;

  // ── GENERATE ────────────────────────────────────────────────────────────────
  if (action === 'generate') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { intention, source, ton, energie, idees_bonus } = req.body;
    if (!intention) return res.status(400).json({ error: 'Une intention est requise' });

    const sourceTexte = source === 'roman' ? LIVRE_ROMAN
      : source === 'boussole' ? LIVRE_BOUSSOLE
      : `${LIVRE_BOUSSOLE}\n\n${LIVRE_ROMAN}`;

    const prompt = `Tu es le porte-voix de Rudy Boucheron, auteur, thérapeute et stratège basé en Bretagne.
Tu écris une newsletter hebdomadaire pour les abonnés d'Oradia, son site dédié à La Boussole Intérieure.
VOIX : directe, poétique sans être mièvre, ancrée dans le corps et le vivant. Ton ${ton || 'contemplatif et incarné'}.
SOURCES : ${sourceTexte}
${energie ? `ÉNERGIE DU MOMENT : ${energie}` : ''}
${idees_bonus ? `FRAGMENTS DU CARNET : ${idees_bonus}` : ''}
INTENTION : ${intention}
STRUCTURE OBLIGATOIRE :
1. OBJET : Une phrase d'accroche email (max 60 caractères)
2. ACCROCHE : 2-3 lignes narratives qui ouvrent l'espace
3. RÉFLEXION : 150-200 mots tirés des livres, concret et incarné
4. PRISE DE CONSCIENCE : Une phrase courte et percutante
5. QUESTION À TENIR : Une seule question, pas de réponse
6. PONT ORACLE : 3-4 lignes reliées à La Boussole Intérieure. Termine par : "→ oradia.fr"
7. SIGNATURE : Max 2 lignes dans la voix de Rudy.
Génère la newsletter complète maintenant. Chaque section délimitée par son titre en MAJUSCULES.`;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Erreur génération Claude', details: 'ANTHROPIC_API_KEY manquante dans les variables Vercel' });
    }
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      });
      return res.status(200).json({ content: message.content[0].text, usage: message.usage });
    } catch (e) {
      return res.status(500).json({ error: 'Erreur génération Claude', details: e.message });
    }
  }

  // ── IDEAS ────────────────────────────────────────────────────────────────────
  if (action === 'ideas') {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('newsletter_ideas').select('*').order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { content, source, tags } = req.body;
      if (!content) return res.status(400).json({ error: 'Contenu requis' });
      const { data, error } = await supabase
        .from('newsletter_ideas')
        .insert([{ content, source: source || null, tags: tags || [] }])
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requis' });
      const { error } = await supabase.from('newsletter_ideas').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  // ── SAVE ─────────────────────────────────────────────────────────────────────
  if (action === 'save') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { id, subject, content, intention, statut } = req.body;
    if (!content) return res.status(400).json({ error: 'Contenu requis' });
    if (id) {
      const { data, error } = await supabase
        .from('newsletter_drafts')
        .update({ subject: subject || null, content, intention: intention || null,
          statut: statut || 'brouillon', updated_at: new Date().toISOString() })
        .eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    } else {
      const { data, error } = await supabase
        .from('newsletter_drafts')
        .insert([{ subject: subject || null, content, intention: intention || null, statut: 'brouillon' }])
        .select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
  }

  // ── SEND ─────────────────────────────────────────────────────────────────────
  if (action === 'send') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
    const { draft_id, subject, test_email } = req.body;
    if (!draft_id) return res.status(400).json({ error: 'draft_id requis' });
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
      return res.status(500).json({ error: 'Erreur envoi test', details: 'BREVO_API_KEY ou BREVO_SENDER_EMAIL manquant dans les variables Vercel' });
    }

    const { data: draft, error: fetchError } = await supabase
      .from('newsletter_drafts').select('*').eq('id', draft_id).single();
    if (fetchError || !draft) return res.status(404).json({ error: 'Brouillon introuvable' });
    if (draft.statut === 'envoyé' && !test_email)
      return res.status(400).json({ error: 'Cette newsletter a déjà été envoyée' });

    const emailSubject = subject || draft.subject || 'La lettre du vivant';
    const htmlContent = textToHtml(draft.content);

    const senderName = process.env.BREVO_SENDER_NAME || 'Rudy — La Boussole Intérieure';
    const senderEmail = process.env.BREVO_SENDER_EMAIL;

    try {
      // ── TEST : envoi transactionnel direct (smtp/email), pas besoin que le contact existe
      if (test_email) {
        const testRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: test_email }],
            subject: `[TEST] ${emailSubject}`,
            htmlContent
          })
        });
        if (!testRes.ok) return res.status(500).json({ error: 'Erreur envoi test', details: await testRes.json() });
        return res.status(200).json({ success: true, mode: 'test' });
      }

      // ── ENVOI RÉEL : créer la campagne puis envoyer à la liste
      const createRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: emailSubject, subject: emailSubject,
          sender: { name: senderName, email: senderEmail },
          type: 'classic', htmlContent,
          recipients: { listIds: [parseInt(process.env.BREVO_LIST_ID)] }
        })
      });
      const campaign = await createRes.json();
      if (!createRes.ok) return res.status(500).json({ error: 'Erreur création campagne Brevo', details: campaign });

      const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendNow`, {
        method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY }
      });
      if (!sendRes.ok) return res.status(500).json({ error: 'Erreur envoi', details: await sendRes.json() });

      await supabase.from('newsletter_drafts')
        .update({ statut: 'envoyé', sent_at: new Date().toISOString(), brevo_campaign_id: campaign.id })
        .eq('id', draft_id);

      return res.status(200).json({ success: true, mode: 'envoi', campaign_id: campaign.id });
    } catch (e) {
      return res.status(500).json({ error: 'Erreur serveur', details: e.message });
    }
  }

  // ── DRAFTS ───────────────────────────────────────────────────────────────────
  if (action === 'drafts') {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const { data, error } = await supabase
          .from('newsletter_drafts')
          .select('*')
          .eq('id', id)
          .single();
        if (error) return res.status(404).json({ error: error.message });
        return res.status(200).json(data);
      }
      const { data, error } = await supabase
        .from('newsletter_drafts')
        .select('id, subject, intention, statut, content, created_at, sent_at')
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requis' });
      const { error } = await supabase.from('newsletter_drafts').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  return res.status(400).json({ error: 'action manquante ou inconnue. Valeurs : generate, ideas, save, send, drafts' });
}
