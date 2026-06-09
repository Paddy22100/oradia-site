// api/tirages/send-email.js
// Point d'entrée unique pour les opérations liées aux tirages :
//   - POST /api/tirages/send-email?action=send-email  (ou sans action) → envoi de l'email du tirage
//   - POST /api/tirages/send-email?action=save        → sauvegarde du tirage dans l'historique (Supabase, RLS par user_id)
//   - GET  /api/tirages/send-email?action=list        → récupération de l'historique de l'utilisateur connecté
//
// Regroupé dans un seul fichier pour rester sous la limite Vercel de 12 fonctions serverless (Hobby plan).

const { createClient } = require('@supabase/supabase-js');

// Crée un client Supabase authentifié AVEC LE TOKEN DE L'UTILISATEUR (pas la clé service-role).
// Cela garantit que les policies RLS (auth.uid() = user_id) s'appliquent réellement :
// chaque personne ne peut lire/écrire QUE ses propres tirages, vérifié au niveau base de données.
function getUserSupabaseClient(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) return null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ============ ACTION : sauvegarder un tirage dans l'historique (Supabase, RLS) ============
async function handleSaveTirage(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getUserSupabaseClient(req);
  if (!supabase) {
    return res.status(401).json({ success: false, message: 'Authentification requise pour enregistrer ce tirage.' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return res.status(401).json({ success: false, message: 'Session invalide ou expirée.' });
  }

  const body = await parseJsonBody(req);
  const { type, intention, cards, cartes, passerelles, synthesis, observationWindow, interpretations } = body;

  // Accepte deux formats : cartes "brutes" (avec bridgeCard imbriqué, format tore.html)
  // ou déjà aplaties (cartes / passerelles, format historique pré-calculé)
  let cartesNames, passerellesArr;
  if (Array.isArray(cards) && cards.length > 0) {
    cartesNames = cards.map(c => (typeof c === 'string' ? c : c.name)).filter(Boolean);
    passerellesArr = cards.filter(c => c && c.bridgeCard).map(c => ({ carte: c.name, passerelle: c.bridgeCard.name }));
  } else {
    cartesNames = Array.isArray(cartes) ? cartes : [];
    passerellesArr = Array.isArray(passerelles) ? passerelles : [];
  }

  if (cartesNames.length === 0) {
    return res.status(400).json({ success: false, message: 'Cartes requises pour enregistrer le tirage.' });
  }

  const row = {
    user_id: userData.user.id,
    type: type || 'Tirage Tore',
    intention: intention || null,
    cartes: cartesNames,
    passerelles: passerellesArr,
    interpretations: interpretations || [],
    synthese: synthesis || null,
    observation_window: observationWindow || null
  };

  const { data, error } = await supabase.from('tirages').insert(row).select().single();
  if (error) {
    console.error('Save tirage error:', error);
    return res.status(500).json({ success: false, message: 'Impossible d\'enregistrer le tirage.' });
  }

  return res.status(200).json({ success: true, tirage: data });
}

// ============ ACTION : lister l'historique des tirages de l'utilisateur connecté ============
async function handleListTirages(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getUserSupabaseClient(req);
  if (!supabase) {
    return res.status(401).json({ success: false, message: 'Authentification requise.' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return res.status(401).json({ success: false, message: 'Session invalide ou expirée.' });
  }

  // RLS garantit déjà l'isolation par utilisateur, mais on filtre explicitement par sécurité défensive
  const { data, error } = await supabase
    .from('tirages')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('List tirages error:', error);
    return res.status(500).json({ success: false, message: 'Impossible de récupérer l\'historique.' });
  }

  // Adapter le format pour rester compatible avec le rendu front existant (qui attend `cartes`, `passerelles`, `synthese`, `date`...)
  const tirages = (data || []).map(t => ({
    id: t.id,
    type: t.type,
    date: t.created_at,
    intention: t.intention,
    cartes: t.cartes || [],
    passerelles: t.passerelles || [],
    interpretations: t.interpretations || [],
    synthese: t.synthese,
    observationWindow: t.observation_window
  }));

  return res.status(200).json({ success: true, tirages });
}

// ============ ACTION : envoyer l'email du tirage (comportement existant, inchangé) ============
async function handleSendEmail(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, intention, cards, analysis, synthesis, subscribeNewsletter, observationWindow } = req.body;

    if (!email || !cards || cards.length === 0) {
      return res.status(400).json({ error: 'Email et cartes requis' });
    }

    // Fonction pour obtenir le chemin de l'image
    const getImagePath = (card) => {
      if (card.imgSrc) return card.imgSrc;
      if (card.image) return card.image;
      return `images/${card.family}/${card.name}.png`;
    };
    
    // Générer le HTML des cartes - incluant les cartes passerelles
    // Chaque carte (et sa passerelle éventuelle) forme une "unité" indivisible,
    // affichée dans une seule cellule, reliée visuellement par un connecteur.
    // Dimensions réduites + attributs width/height HTML (et non seulement CSS)
    // pour que les clients mail réservent l'espace immédiatement et limitent le "jank".
    const CARD_W = 64;
    const CARD_H = 96;

    // Fonction pour générer le bloc <img> d'une carte (avec attributs HTML width/height)
    const cardImg = (card, small = false) => {
      const imgPath = getImagePath(card);
      const isFullUrl = imgPath.startsWith('http');
      const finalImgPath = isFullUrl ? imgPath : `https://oradia.fr/${imgPath.replace(/^\//, '')}`;
      const w = small ? Math.round(CARD_W * 0.8) : CARD_W;
      const h = small ? Math.round(CARD_H * 0.8) : CARD_H;
      return `<img src="${finalImgPath}" alt="${card.name}" width="${w}" height="${h}" loading="eager"
              style="display:block;width:${w}px;height:${h}px;object-fit:cover;border-radius:8px;margin:0 auto;border:1px solid #1e3a5a;">`;
    };

    // Fonction pour générer l'unité complète : carte principale + (éventuelle) passerelle reliée
    const addCardUnitHtml = (card) => {
      const bridge = card.bridgeCard;
      const bridgeBlock = bridge ? `
            <!-- Connecteur visuel vers la carte passerelle -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px auto;">
              <tr>
                <td style="text-align:center;">
                  <div style="width:1px;height:10px;background:#d4af37;margin:0 auto;"></div>
                  <p style="margin:2px 0;color:#d4af37;font-size:9px;letter-spacing:2px;text-transform:uppercase;">&#9660; Passerelle</p>
                  <div style="width:1px;height:10px;background:#d4af37;margin:0 auto;"></div>
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;background:#0c1f33;border:1px solid #d4af37;border-radius:10px;">
              <tr>
                <td style="padding:10px 8px;text-align:center;">
                  ${cardImg(bridge, true)}
                  <p style="margin:8px 0 2px;color:#d4af37;font-size:11px;font-weight:700;">${bridge.name.replace(/_/g, ' ')}</p>
                  <p style="margin:0;color:#4a5a6a;font-size:9px;font-style:italic;text-transform:capitalize;">${bridge.family.replace(/_/g, ' ')}</p>
                </td>
              </tr>
            </table>` : '';

      return `
        <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
          <div style="background:#071828;border:1px solid #1e3a5a;border-radius:12px;padding:16px 12px;">
            ${cardImg(card, false)}
            <p style="margin:10px 0 3px;color:#d4af37;font-size:13px;font-weight:700;">${card.name.replace(/_/g, ' ')}</p>
            <p style="margin:0;color:#4a5a6a;font-size:10px;font-style:italic;text-transform:capitalize;">${card.family.replace(/_/g, ' ')}</p>
            ${bridgeBlock}
          </div>
        </td>
      `;
    };

    // Construire le tableau, 2 unités par ligne, jamais scindées
    let allCardsHtml = '';
    let currentRow = '<tr>';
    let unitsInCurrentRow = 0;

    cards.forEach((card) => {
      currentRow += addCardUnitHtml(card);
      unitsInCurrentRow++;
      if (unitsInCurrentRow >= 2) {
        currentRow += '</tr>';
        allCardsHtml += currentRow;
        currentRow = '<tr>';
        unitsInCurrentRow = 0;
      }
    });

    if (unitsInCurrentRow > 0) {
      // Compléter la ligne avec une cellule vide pour préserver la mise en page
      currentRow += `<td style="width:50%;padding:8px;"></td></tr>`;
      allCardsHtml += currentRow;
    }

    // Tableau des cartes - avec gestion correcte des lignes
    const cardsTable = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${allCardsHtml}
      </table>
    `;

    // Formatage de l'analyse en paragraphes HTML
    const formatAnalysis = (text) => {
      if (!text) return '';
      return text
        .replace(/## [^\n]+\n?/g, '') // retirer les titres markdown
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p style="margin:0 0 14px;color:#e9e7df;font-size:14px;line-height:1.85;text-align:justify;">${p.trim().replace(/\n/g, ' ')}</p>`)
        .join('');
    };

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;width:100%;background:#1a1a2e;font-family:Georgia,'Times New Roman',serif;">
<!-- Tableau "fond" pleine largeur : certains clients (Outlook.com, certaines
     apps mobiles) ignorent l'attribut HTML width="100%" sur les <table> et
     n'honorent que le CSS. On renforce avec style="width:100%" + min-width:100%
     cote CSS, en plus de l'attribut. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;background:#111827;padding:40px 20px;">
  <tr>
    <td align="center" style="width:100%;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#050f23;border-radius:20px;overflow:hidden;border:1px solid #1e2d47;">

        <!-- HEADER -->
        <tr>
          <td style="background:#07142a;padding:44px 40px 36px;text-align:center;border-bottom:1px solid #1e2d47;">
            <!-- Logo formant le O de ORADIA -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="https://oradia.fr/images/logo-hd-v2.jpeg" alt="O" style="display:block;width:44px;height:44px;border-radius:50%;border:1px solid #2a4a6a;margin-right:2px;">
                </td>
                <td style="vertical-align:middle;padding-left:6px;">
                  <p style="margin:0;color:#d4af37;font-family:Georgia,serif;font-size:32px;font-weight:700;letter-spacing:8px;text-transform:uppercase;line-height:1;">RADIA</p>
                </td>
              </tr>
            </table>
            <h1 style="margin:0 0 6px;color:#d4af37;font-family:Georgia,serif;font-size:26px;font-weight:700;letter-spacing:3px;text-transform:uppercase;line-height:1.2;">Votre Tirage du Tore</h1>
            <p style="margin:6px 0 0;color:#4a5a6a;font-size:11px;letter-spacing:2px;text-transform:uppercase;">La Boussole Int&#233;rieure</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
              <tr><td style="height:1px;background:#1e3a5a;"></td></tr>
            </table>
            ${intention ? `
            <div style="margin-top:24px;background:#071828;border:1px solid #1e3a5a;border-radius:12px;padding:16px 24px;">
              <p style="margin:0 0 6px;color:#4a6a5a;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Votre intention</p>
              <p style="margin:0;color:#f5e7a1;font-size:15px;font-style:italic;line-height:1.5;">&#8220; ${intention} &#8221;</p>
            </div>` : ''}
          </td>
        </tr>

        <!-- CARTES -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 24px;color:#d4af37;font-size:10px;letter-spacing:4px;text-transform:uppercase;text-align:center;">&#10022; Vos Cartes &#10022;</p>
            ${cardsTable}
          </td>
        </tr>

        <!-- SÉPARATEUR -->
        <tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:#1e2d47;"></td></tr></table></td></tr>

        <!-- ANALYSE -->
        ${analysis ? `
        <tr>
          <td style="padding:32px 40px 28px;">
            <p style="margin:0 0 20px;color:#d4af37;font-size:10px;letter-spacing:4px;text-transform:uppercase;text-align:center;">&#10022; Message de l'Oracle &#10022;</p>
            <div style="background:#071828;border-left:2px solid #d4af37;padding:20px 20px 6px 22px;border-radius:0 10px 10px 0;">
              ${formatAnalysis(analysis)}
            </div>
          </td>
        </tr>` : ''}

        <!-- SÉPARATEUR -->
        <tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:#1e2d47;"></td></tr></table></td></tr>

        <!-- SYNTHÈSE -->
        ${synthesis ? `
        <tr>
          <td style="padding:28px 40px;">
            <p style="margin:0 0 16px;color:#d4af37;font-size:10px;letter-spacing:4px;text-transform:uppercase;text-align:center;">&#10022; Synth&#232;se &#10022;</p>
            <div style="background:#071828;border:1px solid #1e3a5a;border-radius:12px;padding:22px 24px;">
              <p style="margin:0;color:#f5e7a1;font-size:15px;line-height:1.85;font-style:italic;text-align:center;">${synthesis.replace(/\n/g, ' ')}</p>
            </div>
          </td>
        </tr>` : ''}

        <!-- FENÊTRE D'OBSERVATION — Palier 3 #18 : durée + fonction + attentes -->
        ${observationWindow ? `
        <tr>
          <td style="padding:0 40px 28px;">
            <div style="background:#071828;border:1px solid #d4af37;border-radius:14px;padding:28px 24px;">

              <!-- En-tête avec icône et titre -->
              <div style="text-align:center;margin-bottom:20px;">
                <p style="margin:0 0 6px;font-size:22px;">&#127758;</p>
                <p style="margin:0 0 4px;color:#d4af37;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Fen&#234;tre d'observation</p>
                <p style="margin:6px 0 0;color:#f5e7a1;font-size:20px;font-weight:700;font-family:Georgia,serif;">
                  ${observationWindow.durationDays} jour${observationWindow.durationDays > 1 ? 's' : ''}
                </p>
              </div>

              <!-- Séparateur -->
              <div style="width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.3),transparent);margin:0 0 20px;"></div>

              <!-- Fonction : à quoi ça sert -->
              <div style="background:#050f23;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
                <p style="margin:0 0 8px;color:#d4af37;font-size:10px;letter-spacing:2px;text-transform:uppercase;">&#10024; &Agrave; quoi sert cette fen&#234;tre&nbsp;?</p>
                <p style="margin:0;color:#c8c0a8;font-size:13px;line-height:1.75;">
                  Le tirage du Tore ne s'arr&#234;te pas &#224; l'analyse — il continue de r&#233;sonner dans votre quotidien. La fen&#234;tre d'observation vous invite &#224; rester attentif(ve) aux &#233;chos, synchronicit&#233;s et mouvements int&#233;rieurs qui &#233;mergent dans les jours qui suivent votre tirage.
                </p>
              </div>

              <!-- Texte personnalisé de la fenêtre -->
              ${observationWindow.observationText ? `<p style="margin:0 0 16px;color:#e9e7df;font-size:13px;line-height:1.85;">${observationWindow.observationText.replace(/\n/g, '<br>')}</p>` : ''}

              <!-- Attentes : ce à quoi prêter attention -->
              ${observationWindow.attentionPoints && observationWindow.attentionPoints.length > 0 ? `
              <div style="background:#050f23;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
                <p style="margin:0 0 10px;color:#d4af37;font-size:10px;letter-spacing:2px;text-transform:uppercase;">&#128065; Ce &#224; quoi pr&#234;ter attention</p>
                ${observationWindow.attentionPoints.map(p => `<p style="margin:0 0 8px;color:#c8c0a8;font-size:13px;line-height:1.6;">&#8250;&nbsp; ${p}</p>`).join('')}
              </div>` : ''}

              <!-- Ce qu'on N'attend PAS -->
              <div style="background:#050f23;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
                <p style="margin:0 0 8px;color:#d4af37;font-size:10px;letter-spacing:2px;text-transform:uppercase;">&#129309; Ce qu'on n'attend pas de vous</p>
                <p style="margin:0;color:#c8c0a8;font-size:13px;line-height:1.75;">
                  Il n'y a rien &#224; "faire". Pas de journal obligatoire, pas de performance. Simplement un regard un peu plus attentif pos&#233; sur votre semaine — et une curiosit&#233; bienveillante envers ce qui remonte.
                </p>
              </div>

              <!-- Date de clôture -->
              ${observationWindow.closesAt ? `
              <p style="margin:16px 0 0;color:#4a5a6a;font-size:11px;text-align:center;font-style:italic;">
                &#128337; Vous recevrez un email de cl&#244;ture le&nbsp;
                <strong style="color:#6a7a8a;">${new Date(observationWindow.closesAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
              </p>` : ''}

            </div>
          </td>
        </tr>` : ''}

        <!-- SÉPARATEUR -->
        <tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:#1e2d47;"></td></tr></table></td></tr>

        <!-- CTA -->
        <tr>
          <td style="padding:32px 40px;text-align:center;">
            <p style="margin:0 0 20px;color:#4a5a6a;font-size:13px;font-style:italic;">L'Oracle est l&#224; quand vous en avez besoin.</p>
            <a href="https://oradia.fr/tore.html" style="display:inline-block;background:#d4af37;color:#050f23;text-decoration:none;padding:15px 40px;border-radius:50px;font-family:Georgia,serif;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;">
              Nouveau tirage
            </a>
          </td>
        </tr>

        <!-- BANDEAU ORACLE PHYSIQUE -->
        <tr>
          <td style="padding:0 40px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#071828;border:1px solid #1e3a5a;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="padding:22px 20px;vertical-align:middle;width:60%;">
                  <p style="margin:0 0 4px;color:#4a6a5a;font-size:9px;letter-spacing:3px;text-transform:uppercase;">Pr&#233;commandes ouvertes</p>
                  <p style="margin:0 0 8px;color:#f5e7a1;font-size:17px;font-weight:700;line-height:1.3;">L'Oracle Oradia<br>entre vos mains</p>
                  <p style="margin:0 0 14px;color:#4a5a6a;font-size:12px;line-height:1.65;">64 cartes &#183; Livret &#183; Conte initiatique &#183; Pi&#232;ce de tirage artisanale</p>
                  <a href="https://oradia.fr/precommande-oracle.html" style="display:inline-block;background:#d4af37;color:#050f23;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:10px 20px;border-radius:50px;">
                    Pr&#233;commander
                  </a>
                </td>
                <td style="padding:16px 16px 16px 0;vertical-align:middle;width:40%;text-align:right;">
                  <img src="https://oradia.fr/images/medias/apercu_stripe.png" alt="Oracle Oradia" style="display:block;width:100%;max-width:160px;margin-left:auto;border-radius:8px;border:1px solid #1e3a5a;">
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 40px 32px;border-top:1px solid #1e2d47;text-align:center;">
            <p style="margin:0 0 4px;color:#4a5a6a;font-size:13px;">Avec gratitude,</p>
            <p style="margin:0 0 16px;color:#d4af37;font-size:14px;font-weight:700;">Rudy Boucheron</p>
            <p style="margin:0 0 16px;"><a href="https://oradia.fr" style="color:#4a5a6a;text-decoration:none;font-size:11px;letter-spacing:2px;">oradia.fr</a></p>
            <p style="margin:0;color:#2a3a4a;font-size:10px;line-height:1.6;">Vous recevez cet email car vous avez demand&#233; &#224; recevoir votre tirage.<br>Cet email ne constitue pas un abonnement &#224; notre newsletter.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

    const textContent = `
VOTRE TIRAGE DU TORE
${intention ? `\n« ${intention} »\n` : ''}

VOS CARTES:
${cards.map(c => `- ${c.name} (${c.family})`).join('\n')}

${analysis ? `\nMESSAGE DE L'ORACLE:\n${analysis}\n` : ''}
${synthesis ? `\nSYNTHÈSE:\n${synthesis}\n` : ''}

Faire un nouveau tirage : https://oradia.fr/tore.html

Avec gratitude,
Rudy Boucheron
oradia.fr
    `;

    // Envoyer via Brevo
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: {
          name: 'ORADIA',
          email: 'contact@oradia.fr'
        },
        to: [{ email }],
        subject: intention ? `Votre tirage du Tore : ${intention}` : 'Votre tirage du Tore',
        htmlContent,
        textContent
      })
    });

    if (!brevoResponse.ok) {
      const error = await brevoResponse.json();
      console.error('Brevo error:', error);
      throw new Error('Erreur lors de l\'envoi de l\'email');
    }

    // Si abonnement newsletter demandé
    if (subscribeNewsletter) {
      try {
        await fetch('https://api.brevo.com/v3/contacts', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-key': process.env.BREVO_API_KEY
          },
          body: JSON.stringify({
            email,
            listIds: [parseInt(process.env.BREVO_NEWSLETTER_LIST_ID || '5')],
            updateEnabled: true
          })
        });
      } catch (e) {
        console.error('Newsletter subscription error:', e);
        // Ne pas bloquer l'envoi du tirage si l'abonnement échoue
      }
    }

    return res.status(200).json({ success: true, message: 'Email envoyé avec succès' });

  } catch (error) {
    console.error('Send tirage email error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de l\'envoi de l\'email'
    });
  }
}

// ============ DISPATCH PRINCIPAL ============
export default async function handler(req, res) {
  const action = req.query.action || 'send-email';

  switch (action) {
    case 'save':
      return handleSaveTirage(req, res);
    case 'list':
      return handleListTirages(req, res);
    case 'send-email':
    default:
      return handleSendEmail(req, res);
  }
}
