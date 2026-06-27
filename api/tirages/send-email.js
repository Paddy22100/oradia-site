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
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;width:100%;background:#07112a url('https://oradia.fr/images/oradia-hero-4k.png') center top/cover no-repeat;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  background="https://oradia.fr/images/oradia-hero-4k.png"
  style="width:100%;min-width:100%;background:transparent;padding:36px 0;">
  <tr>
    <td align="center">
      <!-- Overlay sombre pour lisibilité -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:820px;width:100%;">
      <tr><td style="background:rgba(5,10,25,0.82);border-radius:20px;overflow:hidden;border:1px solid rgba(212,175,55,0.2);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:820px;width:100%;">

        <!-- ═══ HEADER ═══ -->
        <tr>
          <td style="background:linear-gradient(160deg,#07142a 0%,#0a1f3a 100%);padding:36px 36px 28px;text-align:center;border-bottom:1px solid #1a2d47;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="https://oradia.fr/images/logo-hd-v2.jpeg" alt="O" style="display:block;width:40px;height:40px;border-radius:50%;border:1px solid rgba(212,175,55,0.4);">
                </td>
                <td style="vertical-align:middle;padding-left:8px;">
                  <p style="margin:0;color:#d4af37;font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:7px;text-transform:uppercase;line-height:1;">RADIA</p>
                </td>
              </tr>
            </table>
            <h1 style="margin:0 0 5px;color:#f0c75e;font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:3px;text-transform:uppercase;line-height:1.2;">Votre Tirage du Tore</h1>
            <p style="margin:0;color:rgba(212,175,55,0.45);font-size:10px;letter-spacing:2px;text-transform:uppercase;">La Boussole Int&#233;rieure</p>
            ${intention ? `
            <div style="margin-top:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.2);border-radius:10px;padding:14px 20px;">
              <p style="margin:0 0 4px;color:rgba(212,175,55,0.55);font-size:9px;letter-spacing:3px;text-transform:uppercase;">Votre intention</p>
              <p style="margin:0;color:#f5e7a1;font-size:14px;font-style:italic;line-height:1.5;">&#8220; ${intention} &#8221;</p>
            </div>` : ''}
          </td>
        </tr>

        <!-- ═══ CARTES EN ROUE ═══ -->
        <tr>
          <td style="padding:28px 24px 20px;">
            <p style="margin:0 0 18px;color:rgba(212,175,55,0.6);font-size:9px;letter-spacing:4px;text-transform:uppercase;text-align:center;">&#10022; Vos Cartes &#10022;</p>
            ${cardsWheelHtml}
          </td>
        </tr>

        <!-- ═══ SÉPARATEUR ═══ -->
        <tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:rgba(212,175,55,0.12);"></td></tr></table></td></tr>

        <!-- ═══ ANALYSE ═══ -->
        ${analysis ? `
        <tr>
          <td style="padding:28px 32px 20px;">
            <p style="margin:0 0 18px;color:rgba(212,175,55,0.6);font-size:9px;letter-spacing:4px;text-transform:uppercase;text-align:center;">&#10022; Message de l'Oracle &#10022;</p>
            <div style="border-left:2px solid rgba(212,175,55,0.4);padding:4px 0 4px 20px;">
              ${formatAnalysis(analysis)}
            </div>
          </td>
        </tr>` : ''}

        <!-- ═══ SYNTHÈSE ═══ -->
        ${synthesis ? `
        <tr>
          <td style="padding:0 32px 24px;">
            <div style="background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.18);border-radius:10px;padding:18px 22px;">
              <p style="margin:0 0 5px;color:rgba(212,175,55,0.55);font-size:9px;letter-spacing:3px;text-transform:uppercase;">Synth&#232;se</p>
              <p style="margin:0;color:#f5e7a1;font-size:14px;line-height:1.8;font-style:italic;">${synthesis.replace(/\n/g, ' ')}</p>
            </div>
          </td>
        </tr>` : ''}

        <!-- ═══ FENÊTRE D'OBSERVATION ═══ -->
        ${obsWindowHtml}

        <!-- ═══ CTA TIRAGE ═══ -->
        <tr>
          <td style="padding:16px 32px 24px;text-align:center;">
            <a href="https://oradia.fr/tore.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f0c75e);color:#050f23;text-decoration:none;padding:14px 40px;border-radius:50px;font-family:Georgia,serif;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;box-shadow:0 4px 16px rgba(212,175,55,0.3);">
              Nouveau tirage
            </a>
          </td>
        </tr>

        <!-- ═══ SÉPARATEUR ═══ -->
        <tr><td style="padding:0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:rgba(212,175,55,0.10);"></td></tr></table></td></tr>

        <!-- ═══ NEWSLETTER ═══ -->
        ${!alreadySubscribed ? `
        <tr>
          <td style="padding:22px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <p style="margin:0 0 3px;color:rgba(212,175,55,0.75);font-size:9px;letter-spacing:3px;text-transform:uppercase;">La lettre d'Oradia</p>
                  <p style="margin:0;color:#c8c0a8;font-size:12px;line-height:1.6;">Symbolique du Tore, int&#233;riorit&#233; et pratiques d'observation.</p>
                </td>
                <td style="vertical-align:middle;padding-left:20px;white-space:nowrap;">
                  <a href="https://oradia.fr/#newsletter" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f0c75e);color:#050f23;text-decoration:none;padding:10px 22px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;white-space:nowrap;">
                    S'inscrire
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- ═══ BANDEAU ORACLE PHYSIQUE ═══ -->
        <tr>
          <td style="padding:0 32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(7,24,40,0.8);border:1px solid rgba(30,58,90,0.8);border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:18px 18px;vertical-align:middle;">
                  <p style="margin:0 0 3px;color:rgba(74,106,90,0.9);font-size:9px;letter-spacing:3px;text-transform:uppercase;">Pr&#233;commandes ouvertes</p>
                  <p style="margin:0 0 6px;color:#f5e7a1;font-size:15px;font-weight:700;line-height:1.3;">L'Oracle Oradia<br>entre vos mains</p>
                  <p style="margin:0 0 12px;color:#4a5a6a;font-size:11px;line-height:1.6;">64 cartes &#183; Livret &#183; Conte initiatique &#183; Pi&#232;ce artisanale</p>
                  <a href="https://oradia.fr/precommande-oracle.html" style="display:inline-block;background:#d4af37;color:#050f23;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:9px 18px;border-radius:50px;">
                    Pr&#233;commander
                  </a>
                </td>
                <td style="padding:12px 14px 12px 0;vertical-align:middle;width:120px;text-align:right;">
                  <img src="https://oradia.fr/images/medias/apercu_stripe.png" alt="Oracle Oradia" width="110" style="display:block;width:110px;border-radius:8px;border:1px solid #1e3a5a;margin-left:auto;">
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ FOOTER ═══ -->
        <tr>
          <td style="padding:18px 32px 28px;border-top:1px solid rgba(212,175,55,0.10);text-align:center;">
            <p style="margin:0 0 3px;color:#4a5a6a;font-size:12px;">Avec gratitude,</p>
            <p style="margin:0 0 14px;color:#d4af37;font-size:13px;font-weight:700;">Rudy Boucheron</p>
            <p style="margin:0 0 12px;">
              <a href="https://oradia.fr" style="color:#4a5a6a;text-decoration:none;font-size:10px;letter-spacing:2px;">oradia.fr</a>
              &#160;&#183;&#160;
              <a href="mailto:contact@oradia.fr" style="color:#4a5a6a;text-decoration:none;font-size:10px;">contact@oradia.fr</a>
            </p>
            <p style="margin:0;color:#2a3a4a;font-size:10px;line-height:1.6;">Vous recevez cet email car vous avez demand&#233; &#224; recevoir votre tirage.<br>Il ne constitue pas un abonnement &#224; notre newsletter.</p>
          </td>
        </tr>

      </table>
      </td></tr>
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
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from('tore_emails').upsert({
      email,
      consent_marketing: !!consentMarketing,
      consent_date: consentMarketing ? new Date().toISOString() : null,
    }, { onConflict: 'email', ignoreDuplicates: false });
  } catch (e) { console.error('[collect-email] Supabase error:', e.message); }

  return res.status(200).json({ success: true });
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

// ============ DISPATCH PRINCIPAL ============
export default async function handler(req, res) {
  const action = req.query.action || 'send-email';

  switch (action) {
    case 'save':          return handleSaveTirage(req, res);
    case 'update':        return handleUpdateTirage(req, res);
    case 'list':          return handleListTirages(req, res);
    case 'collect-email': return handleCollectEmail(req, res);
    case 'check-brevo':   return handleCheckBrevo(req, res);
    case 'send-email':
    default:              return handleSendEmail(req, res);
  }
}
