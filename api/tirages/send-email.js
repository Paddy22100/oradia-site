// api/tirages/send-email.js
// Envoyer le tirage du Tore par email

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, intention, cards, analysis, synthesis, subscribeNewsletter } = req.body;

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
    let allCardsHtml = '';
    
    cards.forEach((card, index) => {
      // Carte principale
      const imgPath = getImagePath(card);
      const isFullUrl = imgPath.startsWith('http');
      const finalImgPath = isFullUrl ? imgPath : `https://oradia.fr/${imgPath.replace(/^\//, '')}`;
      
      allCardsHtml += `
        <td style="width: 33%; padding: 10px; vertical-align: top; text-align: center;">
          <img src="${finalImgPath}" alt="${card.name}" 
            style="width: 100%; max-width: 160px; height: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 1px solid rgba(212,175,55,0.3);">
          <h3 style="color: #d4af37; font-family: Georgia, serif; margin: 12px 0 4px; font-size: 15px; font-weight: 600;">${card.name.replace(/_/g, ' ')}</h3>
          <p style="color: #c8c0a8; font-size: 12px; margin: 0; font-style: italic; text-transform: capitalize;">${card.family.replace(/_/g, ' ')}</p>
        </td>
      `;
      
      // Carte passerelle si présente
      if (card.bridgeCard) {
        const bridgeImgPath = getImagePath(card.bridgeCard);
        const isBridgeFullUrl = bridgeImgPath.startsWith('http');
        const finalBridgeImgPath = isBridgeFullUrl ? bridgeImgPath : `https://oradia.fr/${bridgeImgPath.replace(/^\//, '')}`;
        
        allCardsHtml += `
          <td style="width: 33%; padding: 10px; vertical-align: top; text-align: center;">
            <div style="position: relative;">
              <div style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #d4af37, #f5e7a1); color: #0a192f; font-size: 10px; font-weight: 700; padding: 4px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 1px; z-index: 1;">
                <i class="fas fa-exchange-alt" style="margin-right: 4px;"></i>Passerelle
              </div>
              <img src="${finalBridgeImgPath}" alt="${card.bridgeCard.name}" 
                style="width: 100%; max-width: 160px; height: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 2px solid #d4af37; margin-top: 8px;">
            </div>
            <h3 style="color: #d4af37; font-family: Georgia, serif; margin: 12px 0 4px; font-size: 15px; font-weight: 600;">${card.bridgeCard.name.replace(/_/g, ' ')}</h3>
            <p style="color: #c8c0a8; font-size: 12px; margin: 0; font-style: italic; text-transform: capitalize;">${card.bridgeCard.family.replace(/_/g, ' ')}</p>
          </td>
        `;
      }
    });
    
    // Tableau des cartes - 3 colonnes max par ligne
    const cardsTable = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${allCardsHtml}
        </tr>
      </table>
    `;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0a192f 0%, #051428 100%); font-family: 'Lora', Georgia, serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background: rgba(5,20,40,0.9); border-radius: 24px; border: 1px solid rgba(212,175,55,0.2); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px; text-align: center; background: linear-gradient(135deg, rgba(10,25,47,0.95) 0%, rgba(5,20,40,0.95) 100%);">
              <h1 style="margin: 0; color: #d4af37; font-family: 'Cinzel', serif; font-size: 32px; font-weight: 700; letter-spacing: 0.1em;">
                VOTRE TIRAGE DU TORE
              </h1>
              ${intention ? `<p style="margin: 15px 0 0; color: #f5e7a1; font-size: 16px; font-style: italic;">« ${intention} »</p>` : ''}
            </td>
          </tr>

          <!-- Cartes -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #d4af37; font-family: Georgia, serif; font-size: 24px; text-align: center; margin: 0 0 30px; letter-spacing: 1px;">
                Vos Cartes
              </h2>
              ${cardsTable}
            </td>
          </tr>

          <!-- Analyse -->
          ${analysis ? `
          <tr>
            <td style="padding: 0 40px 40px;">
              <h2 style="color: #d4af37; font-family: 'Cinzel', serif; font-size: 24px; text-align: center; margin: 0 0 20px;">
                Message de l'Oracle
              </h2>
              <div style="background: rgba(212,175,55,0.05); border-left: 3px solid #d4af37; padding: 20px; border-radius: 8px;">
                <p style="color: #c8c0a8; line-height: 1.8; margin: 0; white-space: pre-wrap;">${analysis}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Synthèse -->
          ${synthesis ? `
          <tr>
            <td style="padding: 0 40px 40px;">
              <h2 style="color: #d4af37; font-family: 'Cinzel', serif; font-size: 24px; text-align: center; margin: 0 0 20px;">
                Synthèse
              </h2>
              <div style="background: rgba(212,175,55,0.05); border-left: 3px solid #d4af37; padding: 20px; border-radius: 8px;">
                <p style="color: #c8c0a8; line-height: 1.8; margin: 0; white-space: pre-wrap;">${synthesis}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- CTA -->
          <tr>
            <td style="padding: 0 40px 40px; text-align: center;">
              <a href="https://oradia.fr/tore.html" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #f5e7a1); color: #0a192f; text-decoration: none; padding: 16px 40px; border-radius: 50px; font-family: Georgia, serif; font-weight: 700; font-size: 16px; letter-spacing: 0.05em;">
                Faire un nouveau tirage
              </a>
            </td>
          </tr>

          <!-- BANDEAU PRÉCOMMANDE ORACLE -->
          <tr>
            <td style="padding: 0 40px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background: linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.05) 100%); border: 1px solid rgba(212,175,55,0.35); border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 24px 20px; vertical-align: middle; width: 55%;">
                    <p style="margin: 0 0 6px 0; font-family: Georgia, serif; font-size: 11px; letter-spacing: 3px; color: #d4af37; text-transform: uppercase; font-weight: 600;">
                      <i class="fas fa-star" style="margin-right: 6px;"></i>Précommandes ouvertes
                    </p>
                    <h3 style="margin: 0 0 10px 0; font-family: Georgia, serif; font-size: 22px; font-weight: 600; color: #f5e7a1; line-height: 1.3;">
                      L'Oracle Oradia vous attend
                    </h3>
                    <p style="margin: 0 0 16px 0; font-family: Georgia, serif; font-size: 14px; color: rgba(212,175,55,0.8); line-height: 1.6;">
                      64 cartes, un livret d'accompagnement, un conte initiatique et une pièce de tirage artisanale dans un coffret de protection.
                    </p>
                    <a href="https://oradia.fr/precommande-oracle.html"
                      style="display: inline-block; background: linear-gradient(135deg, #d4af37, #f5e7a1); color: #0a192f; font-family: Georgia, serif; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; text-decoration: none; padding: 12px 24px; border-radius: 50px;">
                      <i class="fas fa-shopping-cart" style="margin-right: 8px;"></i>Précommander maintenant
                    </a>
                  </td>
                  <td style="padding: 20px 16px 20px 0; vertical-align: middle; width: 45%; text-align: right;">
                    <img src="https://oradia.fr/images/medias/apercu_stripe.jpeg" alt="Oracle Oradia - Aperçu" 
                      style="display: block; width: 100%; max-width: 200px; margin-left: auto; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); border: 2px solid rgba(212,175,55,0.3);">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid rgba(212,175,55,0.2); text-align: center;">
              <p style="margin: 0 0 10px; color: #f5e7a1; font-size: 14px; opacity: 0.8; font-family: Georgia, serif;">
                Avec gratitude,<br>
                <strong style="color: #d4af37;">Rudy Boucheron</strong>
              </p>
              <p style="margin: 20px 0 0; color: #c8c0a8; font-size: 12px; opacity: 0.6;">
                <a href="https://oradia.fr" style="color: #d4af37; text-decoration: none;">oradia.fr</a> · 
                <a href="https://oradia.fr/precommande-oracle.html" style="color: #d4af37; text-decoration: none;">Précommander l'Oracle</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

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
            listIds: [parseInt(process.env.BREVO_NEWSLETTER_LIST_ID || '2')],
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
