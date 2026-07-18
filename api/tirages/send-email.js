// api/tirages/send-email.js
// Point d'entrée unique pour les opérations liées aux tirages :
//   - POST /api/tirages/send-email?action=send-email  (ou sans action) → envoi de l'email du tirage
//   - POST /api/tirages/send-email?action=save        → sauvegarde du tirage dans l'historique (Supabase, RLS par user_id)
//   - GET  /api/tirages/send-email?action=list        → récupération de l'historique de l'utilisateur connecté
//   - POST /api/tirages/send-email?action=update      → complète un tirage déjà enregistré (analyse IA, synthèse, fenêtre d'observation)
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
  const { type, intention, cards, cartes, passerelles, synthesis, observationWindow, interpretations, analysis } = body;

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
    observation_window: observationWindow || null,
    analyse_ia: analysis || null
  };

  const { data, error } = await supabase.from('tirages').insert(row).select().single();
  if (error) {
    console.error('Save tirage error:', error);
    return res.status(500).json({ success: false, message: 'Impossible d\'enregistrer le tirage.' });
  }

  return res.status(200).json({ success: true, tirage: data });
}

// ============ ACTION : compléter un tirage déjà enregistré (analyse IA, synthèse, fenêtre d'observation) ============
async function handleUpdateTirage(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getUserSupabaseClient(req);
  if (!supabase) {
    return res.status(401).json({ success: false, message: 'Authentification requise pour mettre à jour ce tirage.' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return res.status(401).json({ success: false, message: 'Session invalide ou expirée.' });
  }

  const body = await parseJsonBody(req);
  const { id, synthesis, observationWindow, interpretations, analysis } = body;

  if (!id) {
    return res.status(400).json({ success: false, message: 'Identifiant du tirage requis.' });
  }

  const updates = {};
  if (synthesis !== undefined) updates.synthese = synthesis;
  if (analysis !== undefined) updates.analyse_ia = analysis;
  if (interpretations !== undefined) updates.interpretations = interpretations;
  if (observationWindow !== undefined) updates.observation_window = observationWindow;

  // RLS garantit déjà que seul le propriétaire peut modifier sa ligne, mais on filtre
  // explicitement par user_id par sécurité défensive.
  const { data, error } = await supabase
    .from('tirages')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userData.user.id)
    .select()
    .single();

  if (error) {
    console.error('Update tirage error:', error);
    return res.status(500).json({ success: false, message: 'Impossible de mettre à jour le tirage.' });
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
    observationWindow: t.observation_window,
    analyseIa: t.analyse_ia || null
  }));

  return res.status(200).json({ success: true, tirages });
}

// ============ ACTION : envoyer l'email du tirage (comportement existant, inchangé) ============
async function handleSendEmail(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, intention, cards, analysis, synthesis, subscribeNewsletter,
            observationWindow: obsWinRaw, observationDays, observationText, attentionPoints } = req.body;

    // Normaliser la fenêtre d'observation : accepte l'ancien format objet OU les champs séparés
    const observationWindow = obsWinRaw || (observationDays ? {
      durationDays:    observationDays,
      observationText: observationText || '',
      attentionPoints: Array.isArray(attentionPoints) ? attentionPoints : [],
      closesAt:        new Date(Date.now() + observationDays * 86400000).toISOString()
    } : null);

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
    // Dimensions des cartes
    const COSMOS_W = 110; const COSMOS_H = 165; // carte cosmos, plus grande
    const CARD_W   =  88; const CARD_H   = 132; // cartes de la roue
    const BRIDGE_W =  66; const BRIDGE_H =  99; // cartes passerelle

    // Couleurs de fallback par famille (si l'image ne charge pas)
    const FAMILY_COLORS = {
      emotion: '#3b6fd4', besoin: '#2e8b57', transmutation: '#7b5ea7',
      archetype: '#c8922a', revelation: '#c0672a', action: '#b03030',
      memoire_cosmos: '#d4af37'
    };

    const emailCardCell = (card, w, h) => {
      const imgPath = getImagePath(card);
      const src = imgPath.startsWith('http') ? imgPath : `https://oradia.fr/${imgPath.replace(/^\//, '')}`;
      const color = FAMILY_COLORS[card.family] || '#4a5a6a';

      // Bloc passerelle (ligne mutante) — affiché sous la carte mère si présent
      let bridgeHtml = '';
      if (card.bridgeCard) {
        const b = card.bridgeCard;
        const bImgPath = getImagePath(b);
        const bSrc = bImgPath.startsWith('http') ? bImgPath : `https://oradia.fr/${bImgPath.replace(/^\//, '')}`;
        const bColor = FAMILY_COLORS[b.family] || '#4a5a6a';
        bridgeHtml = `
          <div style="text-align:center;margin-top:8px;">
            <div style="width:1px;height:10px;background:rgba(212,175,55,0.25);margin:0 auto;"></div>
            <p style="margin:3px 0 5px;color:rgba(212,175,55,0.45);font-size:7px;letter-spacing:1.5px;text-transform:uppercase;">&#9830; Passerelle</p>
            <img src="${bSrc}" alt="${b.name.replace(/_/g,' ')}" width="${BRIDGE_W}" height="${BRIDGE_H}"
              style="display:block;width:${BRIDGE_W}px;height:${BRIDGE_H}px;object-fit:cover;border-radius:6px;margin:0 auto;border:1px solid rgba(212,175,55,0.45);"
              onerror="this.style.background='${bColor}';this.removeAttribute('src');">
            <p style="margin:5px 0 1px;color:#f5e7a1;font-size:11px;font-weight:700;line-height:1.3;">${(b.name.replace(/_/g,' ')).replace(/\b\w/g, l => l.toUpperCase())}</p>
            <p style="margin:0;color:rgba(212,175,55,0.5);font-size:10px;font-style:italic;">ligne mutante</p>
          </div>`;
      }

      return `<td width="33%" style="width:33%;padding:8px;vertical-align:top;">
        <div style="text-align:center;">
          <img src="${src}" alt="${card.name.replace(/_/g,' ')}" width="${w}" height="${h}"
            style="display:block;width:${w}px;height:${h}px;object-fit:cover;border-radius:7px;margin:0 auto;border:1px solid rgba(30,58,90,0.8);"
            onerror="this.style.background='${color}';this.removeAttribute('src');">
          <p style="margin:8px 0 2px;color:#d4af37;font-size:13px;font-weight:700;line-height:1.3;">${(card.name.replace(/_/g,' ')).replace(/\b\w/g, l => l.toUpperCase())}</p>
          <p style="margin:0;color:#8a9aaa;font-size:11px;font-style:italic;text-transform:capitalize;">${card.family.replace(/_/g,' ')}</p>
          ${bridgeHtml}
        </div>
      </td>`;
    };

    // Layout : 2 rangées de 3 + cosmos centré seul en dessous
    const cosmosCard = cards.find(c => c.family === 'memoire_cosmos') || null;
    const wheelCards = cards.filter(c => c.family !== 'memoire_cosmos');

    const makeCardRow = (rowCards) => {
      const cells = rowCards.map(c => emailCardCell(c, CARD_W, CARD_H));
      while (cells.length < 3) cells.push(`<td width="33%" style="width:33%;padding:8px;"></td>`);
      return `<tr>${cells.join('')}</tr>`;
    };

    const cosmosRowHtml = cosmosCard ? (() => {
      const imgPath = getImagePath(cosmosCard);
      const src = imgPath.startsWith('http') ? imgPath : `https://oradia.fr/${imgPath.replace(/^\//, '')}`;
      return `<tr><td colspan="3" style="padding:12px 8px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
          <tr><td style="text-align:center;">
            <img src="${src}" alt="${cosmosCard.name.replace(/_/g,' ')}" width="${COSMOS_W}" height="${COSMOS_H}"
              style="display:block;width:${COSMOS_W}px;height:${COSMOS_H}px;object-fit:cover;border-radius:9px;margin:0 auto;border:2px solid rgba(212,175,55,0.55);"
              onerror="this.style.background='${FAMILY_COLORS.memoire_cosmos}';this.removeAttribute('src');">
            <p style="margin:8px 0 2px;color:#f0c75e;font-size:11px;font-weight:700;">${cosmosCard.name.replace(/_/g,' ')}</p>
            <p style="margin:0;color:rgba(212,175,55,0.5);font-size:8px;letter-spacing:2px;text-transform:uppercase;">Centre du Tore</p>
          </td></tr>
        </table>
      </td></tr>`;
    })() : '';

    const cardsWheelHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${makeCardRow(wheelCards.slice(0, 3))}
        ${makeCardRow(wheelCards.slice(3, 6))}
        ${cosmosRowHtml}
      </table>`;

    // --- Section fenêtre d'observation (pré-calculée hors template literal) ---
    let obsWindowHtml = '';
    if (observationWindow) {
      const dur = observationWindow.durationDays || 1;
      const aiMatch = observationWindow.observationText
        ? observationWindow.observationText.match(/(\d+)\s*jour/i) : null;
      const suggested = aiMatch ? parseInt(aiMatch[1]) : null;
      const durLabel = dur > 1 ? (dur + ' jours') : (dur + ' jour');
      const oracleNote = (suggested && suggested !== dur)
        ? ' (recommandation de l\'oracle : ' + suggested + ' jours)' : '';

      const attentionHtml = (observationWindow.attentionPoints && observationWindow.attentionPoints.length > 0)
        ? '<ul style="margin:6px 0 0;padding-left:16px;">'
          + observationWindow.attentionPoints.map(function(p) {
              return '<li style="color:#c8c0a8;font-size:12px;line-height:1.65;margin-bottom:4px;">' + p + '</li>';
            }).join('')
          + '</ul>'
        : '';

      const closingHtml = observationWindow.closesAt
        ? '<p style="margin:10px 0 0;color:rgba(212,175,55,0.45);font-size:11px;font-style:italic;">Un email de clôture vous sera envoyé le '
          + new Date(observationWindow.closesAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
          + ' pour recueillir vos retours d\'expérience.</p>'
        : '';

      obsWindowHtml = '<tr><td style="padding:0 32px 24px;">'
        + '<div style="background:rgba(10,26,52,0.7);border:1px solid rgba(212,175,55,0.3);border-radius:12px;padding:20px 22px;">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
        + '<td style="vertical-align:top;width:50px;padding-right:14px;text-align:center;"><p style="margin:0;font-size:22px;line-height:1;">&#127758;</p></td>'
        + '<td style="vertical-align:top;">'
        + '<p style="margin:0 0 4px;color:#d4af37;font-size:9px;letter-spacing:2px;text-transform:uppercase;">Fen&ecirc;tre d\'observation</p>'
        + '<p style="margin:0 0 8px;color:#f5e7a1;font-size:13px;line-height:1.6;">Vous avez choisi une fen&ecirc;tre d\'observation de ' + durLabel + ' pour votre tirage' + oracleNote + '.</p>'
        + attentionHtml
        + closingHtml
        + '</td></tr></table></div></td></tr>';
    }

    // Vérifier si déjà abonné à la newsletter — ne bloque pas l'envoi en cas d'erreur Brevo
    const alreadySubscribed = await isBrevoSubscribed(email);

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
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width:640px) {
      .container { width:100% !important; }
      .pad { padding:24px 16px !important; }
      .pad-sm { padding:16px !important; }
      .card-col { display:block !important; width:100% !important; text-align:center !important; }
      .card-img-col { display:none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:Georgia,'Times New Roman',serif;background-color:#07112a;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center top;" bgcolor="#07112a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" background="https://oradia.fr/images/oradia-hero-4k.png" bgcolor="#07112a" style="background-color:#07112a;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center top;">
  <tr>
    <td align="center" style="padding:32px 16px;background-color:rgba(7,17,42,0.75);" bgcolor="#07112a">

      <!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table class="container" role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;" bgcolor="#050a19">

        <!-- HEADER -->
        <tr>
          <td class="pad" align="center" style="padding:32px 36px 24px;border-bottom:1px solid #1a2d47;" bgcolor="#07142a">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px;">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="https://oradia.fr/images/logo-hd-v2.jpeg" alt="O" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:50%;border:1px solid #8a6d20;">
                </td>
                <td style="vertical-align:middle;padding-left:8px;">
                  <p style="margin:0;color:#d4af37;font-family:Georgia,serif;font-size:26px;font-weight:700;letter-spacing:7px;text-transform:uppercase;line-height:1;">RADIA</p>
                </td>
              </tr>
            </table>
            <h1 style="margin:0 0 5px;color:#f0c75e;font-family:Georgia,serif;font-size:20px;font-weight:700;letter-spacing:3px;text-transform:uppercase;line-height:1.2;">Votre Tirage du Tore</h1>
            <p style="margin:0;color:#8a6d20;font-size:10px;letter-spacing:2px;text-transform:uppercase;">La Boussole Int&#233;rieure</p>
            ${intention ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border:1px solid #3a3010;" bgcolor="#0c1830">
              <tr><td style="padding:14px 20px;">
                <p style="margin:0 0 4px;color:#8a6d20;font-size:9px;letter-spacing:3px;text-transform:uppercase;">Votre intention</p>
                <p style="margin:0;color:#f5e7a1;font-size:14px;font-style:italic;line-height:1.5;">&#8220; ${intention} &#8221;</p>
              </td></tr>
            </table>` : ''}
          </td>
        </tr>

        <!-- CARTES -->
        <tr>
          <td class="pad-sm" style="padding:24px 24px 16px;" bgcolor="#050a19">
            <p style="margin:0 0 16px;color:#8a6d20;font-size:9px;letter-spacing:4px;text-transform:uppercase;text-align:center;">&#10022; Vos Cartes &#10022;</p>
            ${cardsWheelHtml}
          </td>
        </tr>

        <!-- SÉPARATEUR -->
        <tr><td style="padding:0 24px;" bgcolor="#050a19"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#1a2d47" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>

        <!-- ANALYSE -->
        ${analysis ? `
        <tr>
          <td class="pad-sm" style="padding:24px 32px 16px;" bgcolor="#050a19">
            <p style="margin:0 0 16px;color:#8a6d20;font-size:9px;letter-spacing:4px;text-transform:uppercase;text-align:center;">&#10022; Message de l'Oracle &#10022;</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:2px solid #8a6d20;">
              <tr><td style="padding:4px 0 4px 20px;">${formatAnalysis(analysis)}</td></tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- SYNTHÈSE -->
        ${synthesis ? `
        <tr>
          <td style="padding:0 32px 20px;" bgcolor="#050a19">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #3a3010;" bgcolor="#0c1830">
              <tr><td style="padding:16px 20px;">
                <p style="margin:0 0 5px;color:#8a6d20;font-size:9px;letter-spacing:3px;text-transform:uppercase;">Synth&#232;se</p>
                <p style="margin:0;color:#f5e7a1;font-size:14px;line-height:1.8;font-style:italic;">${synthesis.replace(/\n/g, ' ')}</p>
              </td></tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- FENÊTRE D'OBSERVATION -->
        ${obsWindowHtml}

        <!-- CTA TIRAGE -->
        <tr>
          <td style="padding:16px 32px 20px;text-align:center;" bgcolor="#050a19">
            <a href="https://oradia.fr/tore.html" style="display:inline-block;background-color:#d4af37;color:#050f23;text-decoration:none;padding:13px 36px;font-family:Georgia,serif;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;">
              Nouveau tirage
            </a>
          </td>
        </tr>

        <!-- SÉPARATEUR -->
        <tr><td style="padding:0 32px;" bgcolor="#050a19"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#1a2d47" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>

        <!-- NEWSLETTER -->
        ${!alreadySubscribed ? `
        <tr>
          <td style="padding:20px 32px;" bgcolor="#050a19">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="card-col" style="vertical-align:middle;">
                  <p style="margin:0 0 3px;color:#8a6d20;font-size:9px;letter-spacing:3px;text-transform:uppercase;">La lettre d'Oradia</p>
                  <p style="margin:0;color:#c8c0a8;font-size:12px;line-height:1.6;">Symbolique du Tore, int&#233;riorit&#233; et pratiques d'observation.</p>
                </td>
                <td style="vertical-align:middle;padding-left:20px;white-space:nowrap;width:110px;">
                  <a href="https://oradia.fr/#newsletter" style="display:inline-block;background-color:#d4af37;color:#050f23;text-decoration:none;padding:10px 20px;font-size:11px;font-weight:700;letter-spacing:1px;white-space:nowrap;">
                    S'inscrire
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- BANDEAU ORACLE PHYSIQUE -->
        <tr>
          <td style="padding:0 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(212,175,55,0.35);border-radius:14px;">
              <tr><td style="padding:0;line-height:0;font-size:0;">
                <img src="https://oradia.fr/images/medias/banniere-facebook.webp" alt="Oracle Oradia — Précommandes ouvertes" width="600" style="display:block;width:100%;height:auto;border:0;border-radius:14px 14px 0 0;">
              </td></tr>
              <tr><td style="background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06));padding:24px 32px;text-align:center;border-radius:0 0 14px 14px;">
                <p style="margin:0 0 6px;color:rgba(212,175,55,0.55);font-family:Georgia,serif;font-size:11px;letter-spacing:0.4em;text-transform:uppercase;">Précommandes ouvertes</p>
                <p style="margin:0 0 6px;color:#f0c75e;font-family:Georgia,serif;font-size:20px;font-weight:600;">L'Oracle Oradia</p>
                <p style="margin:0 0 16px;color:#c8c0a8;font-family:Georgia,serif;font-size:13px;line-height:1.6;">64 cartes · Livret · Conte initiatique · Pièce artisanale</p>
                <a href="https://oradia.fr/precommande-oracle.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a192f;text-decoration:none;padding:12px 32px;border-radius:50px;font-weight:700;font-size:13px;letter-spacing:0.05em;font-family:Georgia,serif;">Précommander</a>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td align="center" style="padding:36px 32px 28px; border-top:1px solid rgba(212,175,55,0.15);" bgcolor="#040c1a">
            <p style="margin:0 0 6px; color:#c8c0a8; font-size:13px; font-style:italic; opacity:0.7; font-family:Georgia,serif;">Avec gratitude,</p>
            <p style="margin:0 0 4px; color:#d4af37; font-size:52px; font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive; font-weight:700; line-height:1.1; letter-spacing:0.01em;">Rudy</p>
            <p style="margin:0 0 16px; color:#c8c0a8; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; opacity:0.55; font-family:Georgia,serif;">Fondateur d'Oradia</p>
            <p style="margin:0 0 20px; text-align:center;">
              <span style="display:inline-block; width:32px; height:1px; background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4)); vertical-align:middle;"></span>
              <span style="display:inline-block; width:5px; height:5px; background:#d4af37; border-radius:50%; opacity:0.45; vertical-align:middle; margin:0 8px;"></span>
              <span style="display:inline-block; width:32px; height:1px; background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent); vertical-align:middle;"></span>
            </p>
            <p style="margin:0 0 20px;"><a href="https://oradia.fr" style="color:#d4af37; text-decoration:none; font-size:13px; letter-spacing:0.08em; font-family:Georgia,serif;">oradia.fr</a></p>
            <p style="margin:0; color:#c8c0a8; font-size:11px; opacity:0.4; font-family:Georgia,serif;">Tu reçois cet email car tu as demandé à recevoir ton tirage.<br>Il ne constitue pas un abonnement à notre newsletter.</p>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->

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
        subject: intention ? `Rudy d'Oradia - Votre tirage du Tore : ${intention}` : "Rudy d'Oradia - Votre tirage du Tore",
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

// ============ ACTION : collecter email + consentement + envoyer le résultat ============
async function handleCollectEmail(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await parseJsonBody(req);
  const { consentMarketing, ...emailPayload } = body;
  const email = emailPayload.email;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Email invalide' });
  }

  // 1. Envoyer l'email de résultat (réutilise handleSendEmail via req synthétique)
  let emailOk = false;
  try {
    await new Promise((resolve, reject) => {
      const fakeReq = { method: 'POST', body: emailPayload };
      const fakeRes = {
        status(code) { return { json(d) { emailOk = d?.success === true; resolve(); } }; },
        json(d)      { emailOk = d?.success === true; resolve(); }
      };
      handleSendEmail(fakeReq, fakeRes).catch(reject);
    });
  } catch (e) {
    console.error('[collect-email] Erreur envoi email:', e.message);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de l\'email' });
  }

  if (!emailOk) {
    return res.status(500).json({ success: false, error: 'Envoi email échoué' });
  }

  // 2. Brevo : liste 5 (avec consentement) ou liste 6 (sans)
  try {
    const listId = consentMarketing
      ? parseInt(process.env.BREVO_NEWSLETTER_LIST_ID || '5')
      : parseInt(process.env.BREVO_LIST_NO_CONSENT_ID || '6');
    const attributes = consentMarketing ? { CONSENT_DATE: new Date().toISOString() } : {};
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({ email, listIds: [listId], attributes, updateEnabled: true })
    });
  } catch (e) { console.error('[collect-email] Brevo error:', e.message); }

  // 3. Supabase : table tore_emails (upsert sur email)
  let isNewEmail = false;
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // Vérifier si email déjà connu pour ne pas renvoyer la promo
    const { data: existing } = await supabase.from('tore_emails').select('email, promo_sent_at').eq('email', email).single();
    isNewEmail = !existing;
    const promoAlreadySent = existing?.promo_sent_at;
    await supabase.from('tore_emails').upsert({
      email,
      consent_marketing: !!consentMarketing,
      consent_date: consentMarketing ? new Date().toISOString() : null,
    }, { onConflict: 'email', ignoreDuplicates: false });

    // La promo part 24h après via le cron job quotidien

    // 3b. Avec consentement, inscrire aussi dans newsletter_contacts — c'est la table
    // que lit le dashboard (Contacts > Inscrits Newsletter). Sans ça, ces personnes
    // consentantes recevaient bien la newsletter (Brevo liste 5) mais restaient
    // invisibles dans le suivi admin.
    if (consentMarketing) {
      await supabase.from('newsletter_contacts').upsert({
        email,
        source: 'tore',
        status: 'active',
        brevo_synced: true,
        brevo_synced_at: new Date().toISOString(),
        metadata: { page: 'tore-analysis', subscribed_at: new Date().toISOString() }
      }, { onConflict: 'email' });
    }
  } catch (e) { console.error('[collect-email] Supabase error:', e.message); }

  return res.status(200).json({ success: true });
}

// ============ EMAIL PROMO ABONNEMENT TORE ============
function buildPromoTirageEmailHtml() {
  const bandeau = 'https://oradia.fr/images/medias/bandea_rappel_abonnement_tore.png';
  const paragraphs = [
    `Vous avez fait votre premier tirage du Tore. Si quelque chose vous a touché là-dedans, c'est que la connexion était réelle.`,
    `Les deux tirages gratuits donnent un aperçu. L'abonnement Tore ouvre quelque chose de plus profond : des tirages illimités, des fenêtres d'observation pour suivre les synchronicités dans le temps, un accès à votre historique personnel, et bientôt des analyses personnalisées...`,
    `Ce n'est pas un outil de divertissement. C'est une pratique : celle de se retourner vers soi avec régularité, de noter ce qui résonne, d'observer comment les cartes parlent à travers les événements de votre vie.`,
    `Si vous sentez que vous voulez aller plus loin, je vous invite à rejoindre l'espace Tore.`
  ];

  const bodyRows = paragraphs.map(p => `
  <tr><td style="padding:0 32px 20px;">
    <div style="color:#c8c0a8; font-size:16px; line-height:1.8; font-family:Georgia,serif; text-align:justify;">${p}</div>
  </td></tr>`).join('');

  const separator = `<tr><td style="padding:4px 40px 4px; text-align:center;">
    <span style="display:inline-block; width:48px; height:1px; background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4)); vertical-align:middle;"></span>
    <span style="display:inline-block; width:6px; height:6px; background:#d4af37; border-radius:50%; opacity:0.55; vertical-align:middle; margin:0 10px;"></span>
    <span style="display:inline-block; width:48px; height:1px; background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent); vertical-align:middle;"></span>
  </td></tr>`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');</style>
</head>
<body style="margin:0; padding:0; background-color:#040d1c;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#040d1c" style="background-color:#040d1c;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(10,25,47,0.95) 0%, rgba(5,20,40,0.96) 100%); max-width:700px; margin:0 auto; border-radius:16px; overflow:hidden; border:1px solid rgba(212,175,55,0.18); box-shadow:0 10px 40px rgba(0,0,0,0.4);">
  <tr><td style="padding:0; line-height:0;">
    <img src="${bandeau}" alt="Oradia — La Boussole Intérieure" width="700" style="display:block; width:100%; height:auto; max-width:700px;">
  </td></tr>
  <tr><td style="padding:30px 32px 0;">
    <h2 style="color:#d4af37; font-family:Georgia,serif; font-size:24px; margin:0 0 20px;">Et si vous alliez plus loin ?</h2>
  </td></tr>
  ${bodyRows}
  ${separator}
  <tr><td style="padding:20px 32px 40px; text-align:center;">
    <a href="https://oradia.fr/tore-abonnement.html?discount=email24h" style="display:inline-block; background:linear-gradient(135deg,#d4af37,#f5e7a1); color:#0a192f; text-decoration:none; padding:16px 40px; border-radius:50px; font-weight:700; font-size:16px; letter-spacing:0.05em;">Accéder à l'abonnement</a>
  </td></tr>
  <tr><td style="padding:0 24px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(212,175,55,0.35);border-radius:14px;">
      <tr><td style="padding:0;line-height:0;font-size:0;">
        <img src="https://oradia.fr/images/medias/banniere-facebook.webp" alt="Oracle Oradia — Précommandes ouvertes" width="600" style="display:block;width:100%;height:auto;border:0;border-radius:14px 14px 0 0;">
      </td></tr>
      <tr><td style="background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06));padding:24px 32px;text-align:center;border-radius:0 0 14px 14px;">
        <p style="margin:0 0 6px;color:rgba(212,175,55,0.55);font-family:Georgia,serif;font-size:11px;letter-spacing:0.4em;text-transform:uppercase;">Précommandes ouvertes</p>
        <p style="margin:0 0 6px;color:#f0c75e;font-family:Georgia,serif;font-size:20px;font-weight:600;">L'Oracle Oradia</p>
        <p style="margin:0 0 16px;color:#c8c0a8;font-family:Georgia,serif;font-size:13px;line-height:1.6;">64 cartes · Livret · Conte initiatique · Pièce artisanale</p>
        <a href="https://oradia.fr/precommande-oracle.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a192f;text-decoration:none;padding:12px 32px;border-radius:50px;font-weight:700;font-size:13px;letter-spacing:0.05em;font-family:Georgia,serif;">Précommander</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 24px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(212,175,55,0.2);border-radius:14px;">
      <tr><td style="padding:20px 24px;text-align:center;">
        <p style="margin:0 0 6px;color:#c8c0a8;font-family:Georgia,serif;font-size:13px;line-height:1.6;">Au fait : tu n'es pas inscrit·e à la newsletter Oradia. Cet email t'a simplement été envoyé suite à ton tirage sur le Tore.</p>
        <p style="margin:0 0 14px;color:#c8c0a8;font-family:Georgia,serif;font-size:13px;line-height:1.6;">Si tu veux recevoir mes prochains messages (réflexions, actualités, avant-premières), tu peux t'inscrire ici :</p>
        <a href="https://oradia.fr/#footer-newsletter-section" style="display:inline-block;background:rgba(212,175,55,0.12);color:#f0c75e;text-decoration:none;padding:10px 24px;border-radius:50px;font-weight:700;font-size:12px;letter-spacing:0.05em;font-family:Georgia,serif;border:1px solid rgba(212,175,55,0.35);">S'inscrire à la newsletter</a>
      </td></tr>
    </table>
  </td></tr>
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
    <p style="margin:0; color:#c8c0a8; font-size:11px; opacity:0.4; font-family:Georgia,serif;">Tu reçois cet email car tu as fait un tirage du Tore sur oradia.fr.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ============ EMAIL CHECK-IN J+3 ============
function buildCheckinEmailHtml() {
  const paragraphs = [
    `Il y a trois jours, vous avez fait un tirage du Tore avec une question en tête.`,
    `Je vous écris juste pour vous demander : avez-vous remarqué quelque chose depuis ? Un événement, une rencontre, une pensée récurrente qui fait écho à ce que les cartes vous ont dit ?`,
    `Ce n'est pas une question rhétorique. C'est souvent dans les jours qui suivent un tirage que les synchronicités se révèlent, si on prend le temps de les observer.`,
    `Si vous voulez, vous pouvez refaire un tirage sur oradia.fr pour continuer d'explorer.`
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
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#040d1c" style="background-color:#040d1c;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(10,25,47,0.95) 0%, rgba(5,20,40,0.96) 100%); max-width:700px; margin:0 auto; border-radius:16px; overflow:hidden; border:1px solid rgba(212,175,55,0.18); box-shadow:0 10px 40px rgba(0,0,0,0.4);">
  <tr><td style="padding:36px 32px 0; text-align:center;">
    <p style="margin:0 0 20px;color:#d4af37;font-family:Georgia,serif;font-size:13px;letter-spacing:0.35em;text-transform:uppercase;opacity:0.7;">ORADIA</p>
    <h2 style="color:#d4af37; font-family:Georgia,serif; font-size:22px; margin:0 0 20px; text-align:left;">Trois jours ont passé…</h2>
  </td></tr>
  ${bodyRows}
  <tr><td style="padding:8px 32px 40px; text-align:center;">
    <a href="https://oradia.fr/tore.html" style="display:inline-block; background:linear-gradient(135deg,#d4af37,#f5e7a1); color:#0a192f; text-decoration:none; padding:16px 40px; border-radius:50px; font-weight:700; font-size:16px; letter-spacing:0.05em;">Refaire un tirage</a>
  </td></tr>
  <tr><td style="padding:36px 32px 28px; border-top:1px solid rgba(212,175,55,0.15); text-align:center;">
    <p style="margin:0 0 6px; color:#c8c0a8; font-size:13px; font-style:italic; opacity:0.7; font-family:Georgia,serif;">Avec gratitude,</p>
    <p style="margin:0 0 4px; color:#d4af37; font-size:52px; font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive; font-weight:700; line-height:1.1; letter-spacing:0.01em;">Rudy</p>
    <p style="margin:0 0 16px; color:#c8c0a8; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; opacity:0.55; font-family:Georgia,serif;">Fondateur d'Oradia</p>
    <p style="margin:0 0 20px;"><a href="https://oradia.fr" style="color:#d4af37; text-decoration:none; font-size:13px; letter-spacing:0.08em; font-family:Georgia,serif;">oradia.fr</a></p>
    <p style="margin:0; color:#c8c0a8; font-size:11px; opacity:0.4; font-family:Georgia,serif;">Tu reçois cet email car tu as fait un tirage du Tore sur oradia.fr.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function sendCheckinEmail(email) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const html = buildCheckinEmailHtml();
  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "Rudy d'Oradia", email: 'contact@oradia.fr' },
      to: [{ email }],
      subject: "Rudy d'Oradia — Trois jours ont passé, avez-vous remarqué quelque chose ?",
      htmlContent: html
    })
  });
  if (!brevoRes.ok) {
    const err = await brevoRes.json().catch(() => ({}));
    throw new Error(`Brevo error: ${err.message || brevoRes.status}`);
  }
  await supabase.from('tore_emails').update({ checkin_sent_at: new Date().toISOString() }).eq('email', email);
  return { sent: true };
}

// ============ CRON : envoyer le check-in J+3 ============
async function handleCronCheckin(req, res) {
  const secret = req.query.cron_secret || '';
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Fenêtre J+3 à J+4 pour éviter d'envoyer rétroactivement à d'anciens tirages
  const from = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const to   = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: targets, error } = await supabase
    .from('tore_emails')
    .select('email')
    .is('checkin_sent_at', null)
    .gte('created_at', from)
    .lt('created_at', to)
    .limit(50);

  if (error) {
    console.error('[cron-checkin] Supabase error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  let sent = 0, failed = 0;
  for (const row of targets || []) {
    try {
      await sendCheckinEmail(row.email);
      sent++;
    } catch (e) {
      console.error('[cron-checkin] Failed for', row.email, e.message);
      failed++;
    }
  }
  console.log(`[cron-checkin] sent=${sent} failed=${failed}`);
  return res.status(200).json({ success: true, sent, failed });
}

async function sendPromoTirageEmail(email) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Vérifier si déjà abonné (pas la peine de promouvoir)
  const alreadySub = await isBrevoSubscribed(email);
  if (alreadySub) return { skipped: true, reason: 'already_subscribed' };

  const html = buildPromoTirageEmailHtml();
  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "Rudy d'ORADIA", email: 'contact@oradia.fr' },
      to: [{ email }],
      subject: "Rudy d'ORADIA — Et si tu allais plus loin avec le Tore ?",
      htmlContent: html
    })
  });

  if (!brevoRes.ok) {
    const err = await brevoRes.json().catch(() => ({}));
    throw new Error(`Brevo error: ${err.message || brevoRes.status}`);
  }

  // Marquer comme envoyé dans tore_emails
  await supabase.from('tore_emails')
    .update({ promo_sent_at: new Date().toISOString() })
    .eq('email', email);

  return { sent: true };
}

// ============ ACTION : envoyer email promo de test (admin) ============
async function handleSendPromoPreview(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await parseJsonBody(req);
  const targetEmail = body.email || 'contact@oradia.fr';
  const html = buildPromoTirageEmailHtml();
  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "Rudy d'ORADIA", email: 'contact@oradia.fr' },
      to: [{ email: targetEmail }],
      subject: "[TEST] Rudy d'ORADIA — Et si tu allais plus loin avec le Tore ?",
      htmlContent: html
    })
  });
  if (!brevoRes.ok) {
    const err = await brevoRes.json().catch(() => ({}));
    return res.status(500).json({ success: false, error: err.message || 'Erreur Brevo' });
  }
  return res.status(200).json({ success: true, sent_to: targetEmail });
}

async function handleCheckinPreview(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await parseJsonBody(req);
  const targetEmail = body.email || 'contact@oradia.fr';
  const html = buildCheckinEmailHtml();
  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "Rudy d'ORADIA", email: 'contact@oradia.fr' },
      to: [{ email: targetEmail }],
      subject: "[TEST] Rudy d'ORADIA — Trois jours ont passé, avez-vous remarqué quelque chose ?",
      htmlContent: html
    })
  });
  if (!brevoRes.ok) {
    const err = await brevoRes.json().catch(() => ({}));
    return res.status(500).json({ success: false, error: err.message || 'Erreur Brevo' });
  }
  return res.status(200).json({ success: true, sent_to: targetEmail });
}

// ============ ACTION : envoi RÉEL (manuel, depuis le dashboard) de la promo abonnement ============
// Distinct de send-promo-preview (test, sujet préfixé [TEST], pas de marquage DB).
async function handleSendPromoManual(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authHeader = req.headers.authorization || '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!rawToken) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(rawToken, process.env.ADMIN_SESSION_SECRET);
    if (decoded.type !== 'admin') throw new Error('type invalide');
  } catch (_) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  const body = await parseJsonBody(req);
  const email = (body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email requis' });

  const html = buildPromoTirageEmailHtml();
  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "Rudy d'ORADIA", email: 'contact@oradia.fr' },
      to: [{ email }],
      subject: "Rudy d'ORADIA — Et si tu allais plus loin avec le Tore ?",
      htmlContent: html
    })
  });
  if (!brevoRes.ok) {
    const err = await brevoRes.json().catch(() => ({}));
    return res.status(500).json({ success: false, error: err.message || 'Erreur Brevo' });
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await supabase.from('tore_emails')
    .update({ promo_sent_at: new Date().toISOString(), promo_skipped: false })
    .eq('email', email);

  return res.status(200).json({ success: true, sent_to: email });
}

// ============ ACTION : liste des tore_emails (admin uniquement) ============
async function handleListToreEmails(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Vérification admin JWT
  const authHeader = req.headers.authorization || '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!rawToken) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(rawToken, process.env.ADMIN_SESSION_SECRET);
    if (decoded.type !== 'admin') throw new Error('type invalide');
  } catch (_) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('tore_emails')
    .select('email, consent_marketing, promo_sent_at, promo_skipped, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, emails: data || [] });
}

// ============ ACTION : import de l'historique des emails de tirage ============
// Reprend les emails laissés lors des tirages passés (table observation_windows,
// alimentée avant la création de tore_emails) et les upsert dans tore_emails.
// promo_sent_at est marqué pour ne PAS envoyer la promo rétroactivement.
async function handleImportToreHistory(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authHeader = req.headers.authorization || '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!rawToken) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(rawToken, process.env.ADMIN_SESSION_SECRET);
    if (decoded.type !== 'admin') throw new Error('type invalide');
  } catch (_) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: windows, error: winErr } = await supabase
    .from('observation_windows')
    .select('email, created_at')
    .not('email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (winErr) return res.status(500).json({ error: winErr.message });

  // Dédupliquer (garder la date la plus ancienne par email)
  const byEmail = {};
  (windows || []).forEach(w => {
    const e = (w.email || '').toLowerCase().trim();
    if (e && !byEmail[e]) byEmail[e] = w.created_at;
  });

  // Ne pas écraser les entrées existantes de tore_emails
  const { data: existing } = await supabase.from('tore_emails').select('email');
  const known = new Set((existing || []).map(r => (r.email || '').toLowerCase().trim()));
  const rows = Object.entries(byEmail)
    .filter(([email]) => !known.has(email))
    .map(([email, created_at]) => ({
      email,
      consent_marketing: false,
      created_at,
      promo_skipped: true // pas de promo rétroactive — distinct de promo_sent_at (envoi réel)
    }));

  if (rows.length === 0) {
    return res.status(200).json({ success: true, imported: 0, message: 'Aucun email historique à importer' });
  }
  const { error: insErr } = await supabase.from('tore_emails').insert(rows);
  if (insErr) return res.status(500).json({ error: insErr.message });
  return res.status(200).json({ success: true, imported: rows.length });
}

// Vérifie si un email est déjà abonné à la liste Brevo (list ID 5 par défaut).
// En cas d'erreur ou de timeout Brevo, retourne false pour ne pas bloquer l'envoi.
async function isBrevoSubscribed(email) {
  try {
    const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      headers: { 'api-key': process.env.BREVO_API_KEY }
    });
    if (!r.ok) return false;
    const contact = await r.json();
    const listId = parseInt(process.env.BREVO_NEWSLETTER_LIST_ID || '5');
    return Array.isArray(contact.listIds) && contact.listIds.includes(listId);
  } catch { return false; }
}

async function handleCheckBrevo(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const email = req.query.email || '';
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email invalide' });
  const subscribed = await isBrevoSubscribed(email);
  return res.status(200).json({ subscribed });
}

// ============ CRON : envoyer promo 24h après le tirage ============
async function handleCronPromoTirage(req, res) {
  const secret = req.query.cron_secret || '';
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Séquence post-tirage en 3 temps : J0 résultat (collect-email), J+3 check-in
  // (cron-checkin), J+7 offre abonnement (ici — anciennement envoyée à 24h).
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: targets, error } = await supabase
    .from('tore_emails')
    .select('email')
    .is('promo_sent_at', null)
    .or('promo_skipped.is.null,promo_skipped.eq.false')
    .lt('created_at', cutoff)
    .limit(50);

  if (error) {
    console.error('[cron-promo-tirage] Supabase error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  let sent = 0, skipped = 0, failed = 0;
  for (const row of targets || []) {
    try {
      const result = await sendPromoTirageEmail(row.email);
      if (result.skipped) skipped++;
      else sent++;
    } catch (e) {
      console.error('[cron-promo-tirage] Failed for', row.email, e.message);
      failed++;
    }
  }

  console.log(`[cron-promo-tirage] sent=${sent} skipped=${skipped} failed=${failed}`);
  return res.status(200).json({ success: true, sent, skipped, failed });
}

// ============ DISPATCH PRINCIPAL ============
export default async function handler(req, res) {
  const action = req.query.action || 'send-email';

  switch (action) {
    case 'save':          return handleSaveTirage(req, res);
    case 'update':        return handleUpdateTirage(req, res);
    case 'list':          return handleListTirages(req, res);
    case 'collect-email':      return handleCollectEmail(req, res);
    case 'check-brevo':        return handleCheckBrevo(req, res);
    case 'send-promo-preview': return handleSendPromoPreview(req, res);
    case 'send-checkin-preview': return handleCheckinPreview(req, res);
    case 'send-promo-manual':  return handleSendPromoManual(req, res);
    case 'list-tore-emails':   return handleListToreEmails(req, res);
    case 'import-tore-history': return handleImportToreHistory(req, res);
    case 'cron-promo-tirage':  return handleCronPromoTirage(req, res);
    case 'cron-checkin':       return handleCronCheckin(req, res);
    case 'send-email':
    default:                 return handleSendEmail(req, res);
  }
}
