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
  // Séparer objet et corps sur le séparateur ---
  const parts = text.split(/\n---\n/);
  let bodyText = parts.length >= 2 ? parts.slice(1).join('\n---\n') : text;
  
  // Supprimer les tirés au début du corps
  bodyText = bodyText.replace(/^[\s\n]*-{3,}[\s\n]*/, '');

  // Citation tirée des livres — extraite si ligne entre guillemets (« » ou " ")
  let citation = '';
  const citationMatch = bodyText.match(/[«""]([^»""]{40,200})[»""]/);
  if (citationMatch) citation = citationMatch[1];

  const lines = bodyText.split('\n');
  let bodyHtml = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { bodyHtml += '<tr><td style="padding:5px 0;"></td></tr>'; continue; }
    // Séparateurs --- (ignorés dans le corps, déjà utilisés pour split)
    if (/^-{3,}$/.test(trimmed)) continue;
    // Lien → oradia.fr
    if (trimmed.startsWith('→')) {
      bodyHtml += `<tr><td style="padding:24px 0 8px 0;text-align:left;">
        <a href="https://oradia.fr" style="color:#d4af37;font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;font-style:italic;text-decoration:none;border-bottom:1px solid rgba(212,175,55,0.35);padding-bottom:2px;">${trimmed}</a>
      </td></tr>`;
      continue;
    }
    // Ligne "Rudy" seule = signature — on l'ignore, gérée dans le footer
    if (/^Rudy\s*$/.test(trimmed)) continue;
    // Paragraphe normal
    bodyHtml += `<tr><td style="padding:7px 0;">
      <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;line-height:1.85;color:#ddd5c0;font-weight:300;">${trimmed}</p>
    </td></tr>`;
  }

  // Bloc citation à insérer avant la signature
  const citationHtml = citation ? `
          <!-- Citation -->
          <tr>
            <td style="padding:8px 48px 36px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:24px 28px;border-left:2px solid rgba(212,175,55,0.5);background:rgba(212,175,55,0.04);">
                    <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;line-height:1.9;color:#c9b87a;font-style:italic;">${citation}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#040e1e;">

  <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:#040e1e;margin:0;padding:0;min-height:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Wrapper max 600px -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;position:relative;">

          <!-- IMAGE DE FOND en cellule répétée sur tout le mail -->
          <tr>
            <td style="padding:0;">

              <!-- Carte principale avec fond image -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background-color:#051428;background-image:url('https://oradia.fr/images/oradia-hero-ak.png');background-size:cover;background-position:center top;background-repeat:no-repeat;border:1px solid rgba(212,175,55,0.25);box-shadow:0 12px 48px rgba(0,0,0,0.6);">

                <!-- Overlay sombre pour lisibilité -->
                <tr>
                  <td style="padding:0;background:rgba(4,14,30,0.82);">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                      <!-- HEADER : Logo + titre -->
                      <tr>
                        <td align="center" style="padding:40px 40px 0 40px;">
                          <!-- Logo rond -->
                          <img src="https://oradia.fr/images/logo-hd-v2.jpeg" alt="ORADIA" width="64" height="64"
                            style="display:block;width:64px;height:64px;border-radius:50%;border:1.5px solid rgba(212,175,55,0.4);margin:0 auto 20px auto;object-fit:cover;">
                          <!-- Surtitre -->
                          <p style="margin:0 0 8px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:11px;letter-spacing:5px;color:#d4af37;text-transform:uppercase;font-weight:400;">La Boussole Intérieure</p>
                          <!-- Titre principal -->
                          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:300;color:#f5e7a1;letter-spacing:1px;line-height:1.3;">La lettre du vivant</h1>
                          <!-- Filet doré -->
                          <div style="width:48px;height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:20px auto 0;"></div>
                        </td>
                      </tr>

                      <!-- Espace -->
                      <tr><td style="padding:8px 0;"></td></tr>

                      <!-- BANDEAU PRÉ-VENTE -->
                      <tr>
                        <td style="padding:0 32px 24px 32px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                            style="background:linear-gradient(135deg,rgba(212,175,55,0.12) 0%,rgba(212,175,55,0.05) 100%);border:1px solid rgba(212,175,55,0.3);border-radius:4px;overflow:hidden;">
                            <tr>
                              <td style="padding:18px 20px;vertical-align:middle;width:60%;">
                                <p style="margin:0 0 4px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:10px;letter-spacing:4px;color:#d4af37;text-transform:uppercase;">Disponible en pré-vente</p>
                                <p style="margin:0 0 10px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:19px;font-weight:600;color:#f5e7a1;line-height:1.3;">L'Oracle Oradia</p>
                                <p style="margin:0 0 14px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:13px;color:rgba(212,175,55,0.7);line-height:1.6;">Un outil de révélation intérieure. Cartes, livrets, tirage guidé.</p>
                                <a href="https://oradia.fr/precommande-oracle.html"
                                  style="display:inline-block;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.5);color:#d4af37;font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:8px 16px;">
                                  Précommander →
                                </a>
                              </td>
                              <td style="padding:12px 16px 12px 0;vertical-align:middle;width:40%;text-align:right;">
                                <img src="https://oradia.fr/images/medias/apercu_stripe.png" alt="Oracle Oradia" width="130"
                                  style="display:block;width:130px;max-width:100%;margin-left:auto;border-radius:3px;opacity:0.92;">
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- CORPS DU TEXTE -->
                      <tr>
                        <td style="padding:8px 48px 24px 48px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${bodyHtml}
                          </table>
                        </td>
                      </tr>

                      ${citationHtml}

                      <!-- SIGNATURE -->
                      <tr>
                        <td style="padding:0 48px 40px 48px;">
                          <div style="width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.2),transparent);margin-bottom:28px;"></div>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width:72px;vertical-align:top;padding-top:4px;">
                                <img src="https://oradia.fr/images/medias/photo_a_propos.png" alt="Rudy Boucheron" width="60" height="60"
                                  style="display:block;width:60px;height:60px;border-radius:50%;border:1.5px solid rgba(212,175,55,0.35);object-fit:cover;object-position:top;"
                                  onerror="this.src='https://oradia.fr/images/logo-hd-v2.jpeg'">
                              </td>
                              <td style="padding-left:16px;vertical-align:top;">
                                <p style="margin:0 0 2px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;color:#f0c75e;letter-spacing:0.5px;line-height:1.1;">Rudy Boucheron</p>
                                <p style="margin:0 0 6px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;letter-spacing:2px;color:rgba(212,175,55,0.55);text-transform:uppercase;">Auteur · Thérapeute · Oradia</p>
                                <a href="https://oradia.fr" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;color:rgba(212,175,55,0.5);text-decoration:none;letter-spacing:1px;">oradia.fr</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- FOOTER -->
                      <tr>
                        <td style="padding:0;border-top:1px solid rgba(212,175,55,0.1);">

                          <!-- Réseaux sociaux -->
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="padding:24px 40px 16px 40px;">
                                <!-- Instagram -->
                                <a href="https://www.instagram.com/oradia_officiel" style="display:inline-block;margin:0 8px;text-decoration:none;">
                                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                                    <tr>
                                      <td style="width:36px;height:36px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:50%;text-align:center;vertical-align:middle;">
                                        <img src="https://cdn-icons-png.flaticon.com/32/2111/2111463.png" width="16" height="16" alt="Instagram"
                                          style="display:block;width:16px;height:16px;margin:10px auto;filter:sepia(1) saturate(2) hue-rotate(5deg) brightness(1.2);">
                                      </td>
                                    </tr>
                                  </table>
                                </a>
                                <!-- Site web -->
                                <a href="https://oradia.fr" style="display:inline-block;margin:0 8px;text-decoration:none;">
                                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                                    <tr>
                                      <td style="width:36px;height:36px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:50%;text-align:center;vertical-align:middle;">
                                        <img src="https://cdn-icons-png.flaticon.com/32/1006/1006771.png" width="16" height="16" alt="Site web"
                                          style="display:block;width:16px;height:16px;margin:10px auto;filter:sepia(1) saturate(2) hue-rotate(5deg) brightness(1.2);">
                                      </td>
                                    </tr>
                                  </table>
                                </a>
                              </td>
                            </tr>
                          </table>

                          <!-- Texte légal -->
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding:0 40px 28px 40px;border-top:1px solid rgba(255,255,255,0.04);">
                                <p style="margin:16px 0 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:11px;color:rgba(255,255,255,0.28);text-align:center;line-height:1.9;letter-spacing:0.3px;">
                                  Chaque mercredi, Rudy vous écrit une lettre.<br>
                                  Vous recevez ce mail parce que vous avez accepté de recevoir les communications Oradia.<br>
                                  Vous ne souhaitez plus recevoir cette newsletter ?<br>
                                  <a href="{{unsubscribe}}" style="color:rgba(212,175,55,0.4);text-decoration:underline;">Vous pouvez vous désinscrire ici.</a>
                                </p>
                              </td>
                            </tr>
                          </table>

                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->

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

    const prompt = `Tu es Rudy Boucheron — auteur, thérapeute et stratège breton. Tu écris une lettre hebdomadaire à tes abonnés, des gens ordinaires qui cherchent à mieux se comprendre. Des gens qui ont une vie, des doutes, des fatigues, et qui parfois sentent qu'il y a quelque chose à comprendre dans ce qu'ils vivent. Qui sont en évolution et en quête de sens. Qui sont dans la spiritualité.

TA VOIX : directe, chaude, sans jargon. Tu parles comme tu penses — avec des phrases courtes quand c'est fort, des phrases plus longues quand tu déroules une idée. Jamais de tirets. Jamais de titres en majuscules dans le corps du texte. Tu n'expliques pas — tu montres, tu racontes, tu poses. Les mots complexes ou que l'on utilise pas tous les jours comme "fascias" peuvent exister si tu les expliques simplement, de préférence avec une image.

CE QUE TU ÉCRIS : une seule lettre fluide, sans rupture visible entre les parties. Le lecteur ne doit pas sentir la structure — il doit sentir qu'on lui parle. Tu pars d'une observation concrète du vivant (une sensation, une image de la nature, quelque chose qu'on fait tous), tu la relies à une idée tirée de tes livres, tu la laisses résonner avec une question ou une image forte, et tu glisses naturellement vers La Boussole Intérieure comme une invitation — pas comme une publicité. Jamais "cliquez ici" ou "découvrez". Plutôt : "c'est exactement pour ça que j'ai créé La Boussole. Si tu sens que c'est le moment, elle t'attend sur oradia.fr"

INTENTION DE CETTE LETTRE : ${intention}
SOURCE : ${source === 'roman' ? 'le roman du Pèlerin et ses figures (le Vieux Chêne, la Fileuse des Spires, le Guérisseur du Choc...)' : source === 'boussole' ? 'le livre La Boussole Intérieure (mémoire implicite, adaptome, fenêtre de tolérance, le dragon et l\'archange, le canal direct...)' : 'les deux livres — le roman du Pèlerin et l\'essai La Boussole Intérieure'}
TON : ${ton === 'poetique' ? 'sensoriel, lent, beaucoup d\'images' : ton === 'scientifique' ? 'ancré dans le concret et le corps, avec des références claires mais vulgarisées' : ton === 'narratif' ? 'tu racontes une scène, une situation, quelqu\'un que tu as rencontré (anonymisé)' : 'contemplatif — tu poses des choses sans tout résoudre'}
${energie ? `ÉNERGIE DU MOMENT à tisser naturellement : ${energie}` : ''}
${idees_bonus ? `FRAGMENTS DE TON CARNET à intégrer si pertinent : ${idees_bonus}` : ''}

FORMAT DE TA RÉPONSE — deux blocs séparés par ---

OBJET EMAIL (une seule ligne, max 55 caractères, pas de question, pas de "découvrez", quelque chose qui donne envie d'ouvrir)

---

LE CORPS DE LA LETTRE (400 à 500 mots, un seul bloc de texte fluide avec des sauts de ligne entre les paragraphes, aucun titre, aucun tiret, aucune liste, aucune section visible. Termine par une citation entre guillemets français « » (30 à 150 caractères) qui résonne avec le thème de la lettre — une phrase percutante tirée de tes livres ou de ton inspiration. Puis la signature : "Rudy" suivi d'une ligne blanche puis "→ oradia.fr")`;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Erreur génération Claude', details: 'ANTHROPIC_API_KEY manquante dans les variables Vercel' });
    }
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1800,
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
