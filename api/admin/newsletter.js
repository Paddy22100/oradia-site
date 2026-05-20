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
  let html = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { html += '<br>'; continue; }
    if (/^[A-ZÀÂÉÈÊËÎÏÔÙÛÜ\s]{3,}\s*:/.test(trimmed)) {
      html += `<p style="font-size:11px;letter-spacing:2px;color:#8B7355;text-transform:uppercase;margin:24px 0 8px;">${trimmed}</p>`;
      continue;
    }
    if (trimmed.startsWith('→')) {
      html += `<p style="margin:16px 0;"><a href="https://oradia.fr" style="color:#C4922A;text-decoration:none;font-weight:600;">${trimmed}</a></p>`;
      continue;
    }
    if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
      html += `<p style="font-style:italic;color:#5C4A2A;font-size:17px;line-height:1.7;margin:16px 0;border-left:3px solid #C4922A;padding-left:16px;">${trimmed.slice(1, -1)}</p>`;
      continue;
    }
    html += `<p style="font-size:15px;line-height:1.8;color:#2C1810;margin:8px 0;">${trimmed}</p>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8F4EE;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F4EE;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#1C1208;padding:32px 40px;text-align:center;border-radius:8px 8px 0 0;">
          <p style="margin:0;color:#C4922A;font-size:11px;letter-spacing:3px;text-transform:uppercase;">La Boussole Intérieure</p>
          <p style="margin:8px 0 0;color:#F8F4EE;font-size:22px;font-weight:normal;font-style:italic;">La lettre du vivant</p>
        </td></tr>
        <tr><td style="background:#FFFFFF;padding:48px 40px;border-radius:0 0 8px 8px;">
          ${html}
          <hr style="border:none;border-top:1px solid #E8DDD0;margin:40px 0;">
          <p style="font-size:12px;color:#9E8B7A;text-align:center;line-height:1.6;">
            Vous recevez cette lettre parce que vous êtes inscrit sur <a href="https://oradia.fr" style="color:#C4922A;">oradia.fr</a><br>
            <a href="{{unsubscribe}}" style="color:#9E8B7A;">Se désinscrire</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
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
        model: 'claude-3-5-sonnet-20241022',
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

    const { data: draft, error: fetchError } = await supabase
      .from('newsletter_drafts').select('*').eq('id', draft_id).single();
    if (fetchError || !draft) return res.status(404).json({ error: 'Brouillon introuvable' });
    if (draft.statut === 'envoyé' && !test_email)
      return res.status(400).json({ error: 'Cette newsletter a déjà été envoyée' });

    const emailSubject = subject || draft.subject || 'La lettre du vivant';
    const htmlContent = textToHtml(draft.content);

    const campaignPayload = test_email
      ? { name: `TEST — ${emailSubject}`, subject: `[TEST] ${emailSubject}`,
          sender: { name: process.env.BREVO_SENDER_NAME || 'Rudy — La Boussole Intérieure',
            email: process.env.BREVO_SENDER_EMAIL },
          type: 'classic', htmlContent }
      : { name: emailSubject, subject: emailSubject,
          sender: { name: process.env.BREVO_SENDER_NAME || 'Rudy — La Boussole Intérieure',
            email: process.env.BREVO_SENDER_EMAIL },
          type: 'classic', htmlContent,
          recipients: { listIds: [parseInt(process.env.BREVO_LIST_ID)] } };

    try {
      const createRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignPayload)
      });
      const campaign = await createRes.json();
      if (!createRes.ok) return res.status(500).json({ error: 'Erreur Brevo', details: campaign });

      if (test_email) {
        const testRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendTest`, {
          method: 'POST',
          headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailTo: [test_email] })
        });
        if (!testRes.ok) return res.status(500).json({ error: 'Erreur envoi test', details: await testRes.json() });
        return res.status(200).json({ success: true, mode: 'test', campaign_id: campaign.id });
      }

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
      const { data, error } = await supabase
        .from('newsletter_drafts')
        .select('id, subject, intention, statut, created_at, sent_at')
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
