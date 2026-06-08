// api/tirages/send-email.js
// Envoyer le tirage du Tore par email

export default async function handler(req, res) {
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
    // Créer un tableau avec gestion des retours à la ligne (3 cartes max par ligne)
    let allCardsHtml = '';
    let currentRow = '<tr>';
    let cardsInCurrentRow = 0;
    
    // Fonction pour ajouter une carte HTML
    const addCardHtml = (card, isBridge = false) => {
      const imgPath = getImagePath(card);
      const isFullUrl = imgPath.startsWith('http');
      const finalImgPath = isFullUrl ? imgPath : `https://oradia.fr/${imgPath.replace(/^\//, '')}`;
      
      const cardHtml = `
        <td style="width:33%;padding:6px;text-align:center;vertical-align:top;">
          <div style="background:#071828;border:1px solid ${isBridge ? '#d4af37' : '#1e3a5a'};border-radius:12px;padding:14px 10px;">
            ${isBridge ? `<p style="margin:0 0 6px;color:#d4af37;font-size:9px;letter-spacing:2px;text-transform:uppercase;">Passerelle</p>` : ''}
            <img src="${finalImgPath}" alt="${card.name}"
              style="display:block;width:80px;height:120px;object-fit:cover;border-radius:8px;margin:0 auto 10px;border:1px solid #1e3a5a;">
            <p style="margin:0 0 3px;color:#d4af37;font-size:12px;font-weight:700;">${card.name.replace(/_/g, ' ')}</p>
            <p style="margin:0;color:#4a5a6a;font-size:10px;font-style:italic;text-transform:capitalize;">${card.family.replace(/_/g, ' ')}</p>
          </div>
        </td>
      `;
      
      return cardHtml;
    };
    
    // Traiter toutes les cartes (principales + passerelles)
    cards.forEach((card, index) => {
      // Ajouter la carte principale
      currentRow += addCardHtml(card, false);
      cardsInCurrentRow++;
      
      // Ajouter la carte passerelle si présente
      if (card.bridgeCard) {
        currentRow += addCardHtml(card.bridgeCard, true);
        cardsInCurrentRow++;
      }
      
      // Si on a 3 cartes dans la ligne, passer à la ligne suivante
      if (cardsInCurrentRow >= 3) {
        currentRow += '</tr>';
        allCardsHtml += currentRow;
        currentRow = '<tr>';
        cardsInCurrentRow = 0;
      }
    });
    
    // Ajouter la dernière ligne si elle contient des cartes
    if (cardsInCurrentRow > 0) {
      currentRow += '</tr>';
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
<body style="margin:0;padding:0;background:#1a1a2e;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#111827;padding:40px 20px;">
  <tr>
    <td align="center">
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

        <!-- FENÊTRE D'OBSERVATION -->
        ${observationWindow ? `
        <tr>
          <td style="padding:0 40px 28px;">
            <div style="background:#071828;border:1px solid #1e3a5a;border-radius:14px;padding:24px;">
              <p style="margin:0 0 4px;color:#d4af37;font-size:10px;letter-spacing:3px;text-transform:uppercase;text-align:center;">Fen&#234;tre d'observation</p>
              <p style="margin:0 0 16px;color:#4a6a5a;font-size:11px;text-align:center;letter-spacing:1px;">${observationWindow.durationDays} jour${observationWindow.durationDays > 1 ? 's' : ''}</p>
              ${observationWindow.observationText ? `<p style="margin:0 0 14px;color:#e9e7df;font-size:13px;line-height:1.8;">${observationWindow.observationText.replace(/\n/g, '<br>')}</p>` : ''}
              ${observationWindow.attentionPoints && observationWindow.attentionPoints.length > 0 ? `
              <div style="background:#050f23;border-radius:8px;padding:14px 16px;margin-top:4px;">
                <p style="margin:0 0 10px;color:#4a6a5a;font-size:10px;letter-spacing:2px;text-transform:uppercase;">Points d'attention</p>
                ${observationWindow.attentionPoints.map(p => `<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;line-height:1.6;">&#8250; ${p}</p>`).join('')}
              </div>` : ''}
              ${observationWindow.closesAt ? `
              <p style="margin:14px 0 0;color:#4a5a6a;font-size:11px;text-align:center;font-style:italic;">Cl&#244;ture le ${new Date(observationWindow.closesAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>` : ''}
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
