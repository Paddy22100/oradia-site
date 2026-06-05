const nodemailer = require('nodemailer');

/**
 * Service Brevo pour l'envoi d'emails
 */
class BrevoService {
    constructor() {
        // Configuration du transporteur SMTP (réutilise la config existante)
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false, // true pour 465, false pour les autres ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        this.fromEmail = process.env.EMAIL_FROM || 'ORADIA <contact@oradia.fr>';
    }

    /**
     * Vérifier la connexion SMTP
     */
    async verifyConnection() {
        try {
            await this.transporter.verify();
            console.log('✅ Connexion Brevo SMTP vérifiée');
            return true;
        } catch (error) {
            console.error('❌ Erreur connexion Brevo SMTP:', error);
            return false;
        }
    }

    /**
     * Envoyer l'email de confirmation de précommande
     */
    async sendPrecommandeConfirmation({ email, name }) {
        try {
            const htmlContent = this.generatePrecommandeConfirmationHTML(name);
            const textContent = this.generatePrecommandeConfirmationText(name);

            const mailOptions = {
                from: this.fromEmail,
                to: email,
                subject: '✨ Inscription confirmée - Précommande Oracle Oradia',
                text: textContent,
                html: htmlContent
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Email envoyé:', info.messageId);
            
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            console.error('❌ Erreur envoi email Brevo:', error);
            throw error;
        }
    }

    /**
     * Envoyer l'analyse de tirage Tore par email
     */
    async sendTirageAnalysis({ email, intention, cards, analysis, synthesis, observationDays, observationText }) {
        const html = this.generateTirageAnalysisHTML({ intention, cards, analysis, synthesis, observationDays, observationText });

        // Utilise l'API HTTP Brevo (même méthode que waitlist.js)
        const apiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr';
        const senderName = process.env.BREVO_SENDER_NAME || 'ORADIA';

        if (apiKey) {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({
                    sender: { email: senderEmail, name: senderName },
                    to: [{ email }],
                    replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
                    subject: '✨ Votre analyse Oradia — Les cartes ont parlé',
                    htmlContent: html
                })
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Brevo API error ${response.status}: ${err}`);
            }
            const data = await response.json();
            return { success: true, messageId: data.messageId };
        }

        // Fallback SMTP Nodemailer si pas de BREVO_API_KEY
        const text = this.generateTirageAnalysisText({ intention, cards, analysis, synthesis, observationDays, observationText });
        const info = await this.transporter.sendMail({
            from: this.fromEmail,
            to: email,
            subject: '✨ Votre analyse Oradia — Les cartes ont parlé',
            text,
            html
        });
        return { success: true, messageId: info.messageId };
    }

    /**
     * Envoyer l'email de réinitialisation de mot de passe
     */
    async sendPasswordReset({ email, resetUrl }) {
        const html = this.generatePasswordResetHTML(resetUrl);
        const apiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr';
        const senderName  = process.env.BREVO_SENDER_NAME  || 'ORADIA';

        if (apiKey) {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
                body: JSON.stringify({
                    sender: { email: senderEmail, name: senderName },
                    to: [{ email }],
                    replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
                    subject: '\u2728 R\u00e9initialisation de votre mot de passe Oradia',
                    htmlContent: html
                })
            });
            if (!response.ok) throw new Error(`Brevo API error ${response.status}`);
            const data = await response.json();
            return { success: true, messageId: data.messageId };
        }

        const info = await this.transporter.sendMail({
            from: this.fromEmail,
            to: email,
            subject: '\u2728 R\u00e9initialisation de votre mot de passe Oradia',
            html
        });
        return { success: true, messageId: info.messageId };
    }

    generatePasswordResetHTML(resetUrl) {
        return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>R\u00e9initialisation du mot de passe - Oradia</title></head>
<body style="margin:0;padding:0;background-color:#030a16;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#030a16;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- EN-T\u00caTE -->
      <tr>
        <td align="center" style="background:linear-gradient(160deg,#0a192f 0%,#030a16 100%);border:1px solid rgba(212,175,55,0.35);border-bottom:none;border-radius:20px 20px 0 0;padding:44px 32px 32px;">
          <p style="color:rgba(212,175,55,0.5);font-size:11px;letter-spacing:0.35em;text-transform:uppercase;margin:0 0 10px;">Espace membre</p>
          <h1 style="color:#d4af37;font-size:36px;font-weight:400;letter-spacing:0.08em;margin:0;font-family:Georgia,serif;">ORADIA</h1>
          <div style="width:48px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.6),transparent);margin:16px auto;"></div>
          <p style="color:rgba(245,231,161,0.65);font-size:14px;font-style:italic;margin:0;letter-spacing:0.05em;">La Boussole Int\u00e9rieure</p>
        </td>
      </tr>

      <!-- CONTENU -->
      <tr>
        <td style="background:linear-gradient(160deg,#0a1628 0%,#030a16 100%);border-left:1px solid rgba(212,175,55,0.35);border-right:1px solid rgba(212,175,55,0.35);padding:36px 40px;">
          <p style="color:rgba(212,175,55,0.55);font-size:10px;text-transform:uppercase;letter-spacing:0.25em;margin:0 0 16px;">R\u00e9initialisation du mot de passe</p>
          <p style="color:#e9e7df;font-size:15px;line-height:1.8;margin:0 0 24px;">Vous avez demand\u00e9 \u00e0 r\u00e9initialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
          <p style="color:rgba(215,205,170,0.55);font-size:13px;line-height:1.7;margin:0 0 32px;">Ce lien est valable <strong style="color:rgba(212,175,55,0.75);">10 minutes</strong>. Si vous n'\u00eates pas \u00e0 l'origine de cette demande, ignorez simplement cet email.</p>
        </td>
      </tr>

      <!-- CTA -->
      <tr>
        <td align="center" style="background:linear-gradient(160deg,#0a1628 0%,#030a16 100%);border-left:1px solid rgba(212,175,55,0.35);border-right:1px solid rgba(212,175,55,0.35);padding:8px 40px 36px;">
          <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#d4af37 0%,#f5e7a1 50%,#d4af37 100%);color:#030a16;text-decoration:none;padding:16px 44px;border-radius:50px;font-family:Georgia,serif;font-weight:bold;font-size:15px;letter-spacing:0.08em;">Choisir un nouveau mot de passe</a>
          <p style="color:rgba(148,163,184,0.4);font-size:11px;margin:18px 0 0;word-break:break-all;">Ou copiez ce lien : <a href="${resetUrl}" style="color:rgba(212,175,55,0.45);">${resetUrl}</a></p>
        </td>
      </tr>

      <!-- PIED DE PAGE -->
      <tr>
        <td align="center" style="background:#020710;border:1px solid rgba(212,175,55,0.2);border-top:1px solid rgba(212,175,55,0.15);border-radius:0 0 20px 20px;padding:24px 32px;">
          <p style="color:rgba(245,231,161,0.35);font-size:11px;line-height:1.7;margin:0;">
            &copy; Oradia &mdash; La Boussole Int\u00e9rieure<br>
            Si vous n'avez pas demand\u00e9 cette r\u00e9initialisation, ignorez cet email.<br>
            <a href="https://oradia.fr" style="color:rgba(212,175,55,0.45);text-decoration:none;">oradia.fr</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body></html>`;
    }

    generateTirageAnalysisHTML({ intention, cards, analysis, synthesis, observationDays, observationText }) {
        const familyLabel = f => ({
            emotions: 'Émotion', besoins: 'Besoin', transmutation: 'Transmutation',
            memoire_cosmos: 'Mémoire Cosmos', revelation: 'Révélation',
            portail: 'Portail', archetypes: 'Archétype', actions: 'Actions'
        }[f] || f.replace(/_/g, ' '));

        
        const FAMILY_LABELS = {
    emotions: 'Émotions', besoins: 'Besoins',
    transmutation: 'Transmutation', archetypes: 'Archétypes',
    revelations: 'Révélations', actions: 'Actions',
    memoire_cosmos: 'Mémoire Cosmos'
};
const FAMILY_COLORS = {
    emotions: '#8B2635', besoins: '#C47D2E',
    transmutation: '#B8962E', archetypes: '#4A3580',
    revelations: '#2E7D32', actions: '#C4A82E',
    memoire_cosmos: '#0E2A57'
};

const cardsHTML = (cards || []).map(card => {
    const label = FAMILY_LABELS[card.family] || card.family;
    const color = FAMILY_COLORS[card.family] || '#d4af37';
    const hasBridge = card.bridgeCard;
    
    let cardHTML = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin-bottom:16px;background:rgba(5,15,35,0.6);
             border:1px solid rgba(212,175,55,0.15);border-radius:12px;
             overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;">
          <!-- Label famille -->
          <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.25em;
                     text-transform:uppercase;color:${color};
                     font-family:Georgia,serif;">
            ${label}
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr valign="top">
              <!-- Image carte principale -->
              <td width="90" style="padding-right:16px;">
                ${card.imgSrc ? `<img src="${card.imgSrc}"
                  alt="${card.name}"
                  width="80" height="112"
                  style="border-radius:8px;display:block;
                         border:1px solid rgba(212,175,55,0.2);">` : ''}
              </td>
              <!-- Nom et quote -->
              <td style="vertical-align:top;">
                <p style="margin:0 0 6px;font-size:16px;font-weight:bold;
                           color:#d4af37;font-family:Georgia,serif;">
                  ${card.name || ''}
                </p>
                ${card.quote ? `<p style="margin:0;font-size:13px;
                  font-style:italic;color:rgba(232,223,200,0.7);
                  line-height:1.5;border-left:2px solid rgba(212,175,55,0.3);
                  padding-left:10px;">${card.quote}</p>` : ''}`;

    if (hasBridge) {
        cardHTML += `
                <!-- Carte passerelle -->
                <table cellpadding="0" cellspacing="0" border="0"
                  style="margin-top:12px;background:rgba(212,175,55,0.08);
                         border:1px solid rgba(212,175,55,0.25);
                         border-radius:8px;overflow:hidden;width:100%;">
                  <tr valign="top">
                    <td width="60" style="padding:10px 0 10px 10px;">
                      ${card.bridgeCard.imgSrc ? `<img src="${card.bridgeCard.imgSrc}"
                        alt="${card.bridgeCard.name}"
                        width="50" height="70"
                        style="border-radius:5px;display:block;
                               border:1px solid rgba(212,175,55,0.3);">` : ''}
                    </td>
                    <td style="padding:10px 12px;vertical-align:top;">
                      <p style="margin:0 0 3px;font-size:9px;
                                 letter-spacing:0.2em;text-transform:uppercase;
                                 color:rgba(212,175,55,0.6);">
                        Passerelle · Actions
                      </p>
                      <p style="margin:0 0 4px;font-size:13px;
                                 font-weight:bold;color:#d4af37;">
                        ${card.bridgeCard.name || ''}
                      </p>
                      ${card.bridgeCard.quote ? `<p style="margin:0;
                        font-size:11px;font-style:italic;
                        color:rgba(232,223,200,0.6);line-height:1.4;">
                        ${card.bridgeCard.quote}</p>` : ''}
                    </td>
                  </tr>
                </table>`;
    }

    cardHTML += `
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
    
    return cardHTML;
}).join('');

const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre Tirage du Tore – Oradia</title>
</head>
<body style="margin:0;padding:0;background:#08122a;font-family:Georgia,'Times New Roman',serif;color:#e8dfc8;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#08122a;">
<tr><td align="center" style="padding:32px 16px;">

  <table width="600" cellpadding="0" cellspacing="0" border="0"
    style="max-width:600px;width:100%;background:linear-gradient(145deg,#0d1f3c,#06101f);
           border:1px solid rgba(212,175,55,0.3);border-radius:16px;overflow:hidden;">

    <!-- HEADER -->
    <tr>
      <td style="background:rgba(5,15,35,0.9);padding:32px 24px;text-align:center;
                 border-bottom:1px solid rgba(212,175,55,0.2);">
        <img src="https://oradia.fr/images/medias/apercu_stripe.jpg"
             alt="Oradia" width="56" height="56"
             style="border-radius:50%;display:block;margin:0 auto 16px;
                    border:2px solid rgba(212,175,55,0.4);">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.3em;
                  text-transform:uppercase;color:rgba(212,175,55,0.5);
                  font-family:Georgia,serif;">Oracle Oradia</p>
        <h1 style="margin:0;font-size:26px;font-family:Georgia,serif;
                   color:#d4af37;letter-spacing:0.1em;font-weight:normal;">
          VOTRE TIRAGE DU TORE
        </h1>
        <p style="margin:12px 0 0;font-size:15px;color:rgba(232,223,200,0.6);
                  font-style:italic;">
          « ${intention || ''} »
        </p>
      </td>
    </tr>

    <!-- CARTES -->
    <tr>
      <td style="padding:32px 24px;">
        <h2 style="margin:0 0 20px;font-size:16px;letter-spacing:0.2em;
                   text-transform:uppercase;color:#d4af37;text-align:center;
                   font-family:Georgia,serif;font-weight:normal;">
          Vos Cartes
        </h2>
        ${cardsHTML}
      </td>
    </tr>

    <!-- ANALYSE -->
    ${analysis ? `
    <tr>
      <td style="padding:0 24px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:rgba(5,15,35,0.5);border-left:3px solid #d4af37;
                 border-radius:0 8px 8px 0;">
          <tr>
            <td style="padding:20px 20px;">
              <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.2em;
                         text-transform:uppercase;color:rgba(212,175,55,0.6);">
                Message de l'Oracle
              </p>
              <p style="margin:0;font-size:14px;line-height:1.7;
                         color:rgba(232,223,200,0.85);">${analysis}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''}

    <!-- SYNTHÈSE -->
    ${synthesis ? `
    <tr>
      <td style="padding:0 24px 24px;">
        <h3 style="margin:0 0 12px;font-size:14px;letter-spacing:0.15em;
                   text-transform:uppercase;color:#d4af37;font-weight:normal;">
          Synthèse
        </h3>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border:1px solid rgba(212,175,55,0.2);border-radius:8px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0;font-size:14px;line-height:1.7;
                         color:rgba(232,223,200,0.85);">${synthesis}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''}

    <!-- FENÊTRE D'OBSERVATION -->
    <tr>
      <td style="padding:0 24px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:rgba(212,175,55,0.06);
                 border:1px solid rgba(212,175,55,0.2);border-radius:8px;">
          <tr>
            <td style="padding:20px;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:bold;
                         color:#d4af37;text-align:center;font-family:Georgia,serif;">
                Votre Fenêtre d'Observation
              </p>
              <p style="margin:0 0 12px;font-size:13px;text-align:center;
                         color:rgba(212,175,55,0.6);">
                ${observationDays ? observationDays + ' jour' + (observationDays > 1 ? 's' : '') : '3 jours'}
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;
                         color:rgba(232,223,200,0.75);font-style:italic;">
                ${observationText || 'Observez les synchronicités liées à votre question.'}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA PRÉCOMMANDE -->
    <tr>
      <td style="padding:0 24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:rgba(5,15,35,0.7);
                 border:1px solid rgba(212,175,55,0.25);border-radius:12px;">
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.3em;
                         text-transform:uppercase;color:rgba(212,175,55,0.5);">
                Précommandes ouvertes
              </p>
              <p style="margin:0 0 8px;font-size:18px;font-weight:bold;
                         color:#d4af37;font-family:Georgia,serif;">
                L'Oracle Oradia vous attend
              </p>
              <p style="margin:0 0 16px;font-size:13px;
                         color:rgba(232,223,200,0.65);">
                64 cartes · livret · conte initiatique · pièce artisanale
              </p>
              <a href="https://oradia.fr/precommande-oracle.html"
                 style="display:inline-block;background:linear-gradient(135deg,#d4af37,#b8962e);
                        color:#06101f;padding:12px 28px;border-radius:99px;
                        text-decoration:none;font-size:13px;letter-spacing:0.1em;
                        text-transform:uppercase;font-family:Georgia,serif;
                        font-weight:bold;">
                Précommander maintenant
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background:rgba(5,15,35,0.9);padding:24px;text-align:center;
                 border-top:1px solid rgba(212,175,55,0.15);">
        <p style="margin:0 0 8px;font-size:13px;color:rgba(232,223,200,0.5);">
          Avec gratitude,
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#d4af37;
                   font-family:Georgia,serif;">
          Rudy Boucheron
        </p>
        <a href="https://oradia.fr"
           style="font-size:12px;color:rgba(212,175,55,0.5);text-decoration:none;
                  letter-spacing:0.1em;">oradia.fr</a>
        <p style="margin:16px 0 0;font-size:11px;color:rgba(232,223,200,0.3);">
          © 2026 Oradia · Tous droits réservés<br>
          <a href="https://oradia.fr/unsubscribe" style="color:rgba(212,175,55,0.3);
             text-decoration:none;">Se désinscrire</a>
        </p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
    }

    generateTirageAnalysisText({ intention, cards, analysis, synthesis, observationDays, observationText }) {
        const cardLines = (cards || []).map(c => {
            let line = `• ${c.name.replace(/_/g, ' ')} (${c.family})`;
            if (c.bridgeCard) line += ` → Passerelle : ${c.bridgeCard.name.replace(/_/g, ' ')}`;
            return line;
        }).join('\n');

        return `✨ VOTRE ANALYSE ORADIA\n\nIntention : ${intention || 'Question personnelle'}\n\nCartes tirées :\n${cardLines}\n\n---\n\n${analysis || ''}\n\nSynthèse :\n${synthesis || ''}\n\noradia.fr`;
    }

    /**
     * Générer le contenu HTML de l'email de confirmation
     */
    generatePrecommandeConfirmationHTML(name) {
        return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inscription confirmée - Oracle Oradia</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Cormorant Garamond', Georgia, serif; background-color: #0a192f; color: #f5e7a1;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a192f;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, rgba(26,54,93,0.8), rgba(5,20,40,0.9)); border: 1px solid rgba(212,175,55,0.3); border-radius: 16px;">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 40px 20px;">
                            <h1 style="color: #d4af37; font-size: 32px; margin: 0; font-weight: 700;">ORADIA</h1>
                            <p style="color: #f5e7a1; font-size: 18px; margin: 10px 0 0 0;">La Boussole Intérieure</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 40px 40px;">
                            <!-- Greeting -->
                            <p style="color: #f5e7a1; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                Bonjour ${name},
                            </p>
                            
                            <p style="color: #f5e7a1; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                Merci pour votre inscription ! Vous serez parmi les premiers informés lors de l'ouverture de la précommande de l'Oracle Oradia.
                            </p>
                            
                            <!-- Confirmation Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3); border-radius: 12px; margin: 30px 0;">
                                <tr>
                                    <td style="padding: 30px;">
                                        <h2 style="color: #d4af37; font-size: 24px; margin: 0 0 20px 0;">✅ Inscription confirmée</h2>
                                        <p style="color: #f5e7a1; font-size: 16px; line-height: 1.6; margin: 0;">
                                            Votre inscription pour la précommande a été enregistrée avec succès.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- What's Next -->
                            <h2 style="color: #d4af37; font-size: 22px; margin: 30px 0 20px 0;">📅 Prochaines étapes</h2>
                            
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding: 15px 0;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td width="40" valign="top">
                                                    <div style="width: 32px; height: 32px; background: #d4af37; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #0a192f; font-weight: bold;">1</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <h3 style="color: #d4af37; font-size: 18px; margin: 0 0 8px 0;">Notification d'ouverture</h3>
                                                    <p style="color: #f5e7a1; font-size: 14px; line-height: 1.6; margin: 0; opacity: 0.9;">
                                                        Vous recevrez un email dès l'ouverture de la précommande.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <tr>
                                    <td style="padding: 15px 0;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td width="40" valign="top">
                                                    <div style="width: 32px; height: 32px; background: rgba(212,175,55,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #d4af37; font-weight: bold;">2</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <h3 style="color: #d4af37; font-size: 18px; margin: 0 0 8px 0;">Accès prioritaire</h3>
                                                    <p style="color: #f5e7a1; font-size: 14px; line-height: 1.6; margin: 0; opacity: 0.9;">
                                                        En tant qu'inscrit, vous bénéficierez d'un accès prioritaire.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <tr>
                                    <td style="padding: 15px 0;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td width="40" valign="top">
                                                    <div style="width: 32px; height: 32px; background: rgba(212,175,55,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #d4af37; font-weight: bold;">3</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <h3 style="color: #d4af37; font-size: 18px; margin: 0 0 8px 0;">Réception de votre Oracle</h3>
                                                    <p style="color: #f5e7a1; font-size: 14px; line-height: 1.6; margin: 0; opacity: 0.9;">
                                                        Votre oracle sera expédié dès la production terminée.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Highlight Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background: rgba(212,175,55,0.08); border-left: 4px solid #d4af37; border-radius: 8px; margin: 30px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <h3 style="color: #d4af37; font-size: 18px; margin: 0 0 10px 0;">🌟 Information importante</h3>
                                        <p style="color: #f5e7a1; font-size: 14px; line-height: 1.6; margin: 0;">
                                            En tant qu'inscrit, vous bénéficierez d'un accès prioritaire lors de l'ouverture officielle de la précommande.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="https://oradia.fr/oracle.html" style="display: inline-block; background: linear-gradient(to right, #d4af37, #f5e7a1); color: #0a192f; text-decoration: none; padding: 16px 32px; border-radius: 50px; font-weight: bold; font-size: 16px;">
                                            Découvrir l'Oracle
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Closing -->
                            <p style="color: #f5e7a1; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; opacity: 0.8;">
                                À très bientôt,<br>
                                Rudy Boucheron
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; border-top: 1px solid rgba(212,175,55,0.2);">
                            <p style="color: #f5e7a1; font-size: 12px; line-height: 1.6; margin: 0; opacity: 0.6; text-align: center;">
                                Vous recevez cet email car vous vous êtes inscrit à la précommande de l'Oracle Oradia.<br>
                                <a href="https://oradia.fr" style="color: #d4af37; text-decoration: none;">oradia.fr</a>
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
    }

    /**
     * Générer le contenu texte de l'email de confirmation
     */
    generatePrecommandeConfirmationText(name) {
        return `
ORADIA - La Boussole Intérieure

Bonjour ${name},

Merci pour votre inscription ! Vous serez parmi les premiers informés lors de l'ouverture de la précommande de l'Oracle Oradia.

✅ INSCRIPTION CONFIRMÉE
Votre inscription pour la précommande a été enregistrée avec succès.

📅 PROCHAINES ÉTAPES

1. Notification d'ouverture
   Vous recevrez un email dès l'ouverture de la précommande.

2. Accès prioritaire
   En tant qu'inscrit, vous bénéficierez d'un accès prioritaire.

3. Réception de votre Oracle
   Votre oracle sera expédié dès la production terminée.

🌟 INFORMATION IMPORTANTE
En tant qu'inscrit, vous bénéficierez d'un accès prioritaire lors de l'ouverture officielle de la précommande.

Découvrir l'Oracle : https://oradia.fr/oracle.html

À très bientôt,
Rudy Boucheron

---
Vous recevez cet email car vous vous êtes inscrit à la précommande de l'Oracle Oradia.
oradia.fr
        `;
    }

    /**
     * Envoyer un email de notification de lancement (à tous les inscrits)
     */
    async sendLaunchNotification({ email, name }) {
        try {
            const htmlContent = this.generateLaunchNotificationHTML(name);
            const textContent = this.generateLaunchNotificationText(name);

            const mailOptions = {
                from: this.fromEmail,
                to: email,
                subject: '🎉 La précommande de l\'Oracle Oradia est ouverte !',
                text: textContent,
                html: htmlContent
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Email de lancement envoyé:', info.messageId);
            
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            console.error('❌ Erreur envoi email de lancement:', error);
            throw error;
        }
    }

    /**
     * Générer le contenu HTML de l'email de lancement
     */
    generateLaunchNotificationHTML(name) {
        return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Précommande ouverte - Oracle Oradia</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Cormorant Garamond', Georgia, serif; background-color: #0a192f; color: #f5e7a1;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a192f;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, rgba(26,54,93,0.8), rgba(5,20,40,0.9)); border: 1px solid rgba(212,175,55,0.3); border-radius: 16px;">
                    <tr>
                        <td align="center" style="padding: 40px 20px;">
                            <h1 style="color: #d4af37; font-size: 32px; margin: 0; font-weight: 700;">🎉 C'est le moment !</h1>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 0 40px 40px 40px;">
                            <p style="color: #f5e7a1; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                Bonjour ${name},
                            </p>
                            
                            <p style="color: #f5e7a1; font-size: 18px; line-height: 1.6; margin: 0 0 20px 0; font-weight: bold;">
                                La précommande de l'Oracle Oradia est maintenant ouverte !
                            </p>
                            
                            <p style="color: #f5e7a1; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                En tant qu'inscrit prioritaire, vous avez maintenant accès à la précommande avant tout le monde.
                            </p>
                            
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="https://oradia.fr/precommande-oracle.html" style="display: inline-block; background: linear-gradient(to right, #d4af37, #f5e7a1); color: #0a192f; text-decoration: none; padding: 18px 40px; border-radius: 50px; font-weight: bold; font-size: 18px;">
                                            Précommander maintenant
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #f5e7a1; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; opacity: 0.8;">
                                À très bientôt,<br>
                                Rudy Boucheron
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
    }

    /**
     * Générer le contenu texte de l'email de lancement
     */
    generateLaunchNotificationText(name) {
        return `
🎉 C'EST LE MOMENT !

Bonjour ${name},

La précommande de l'Oracle Oradia est maintenant ouverte !

En tant qu'inscrit prioritaire, vous avez maintenant accès à la précommande avant tout le monde.

Précommander maintenant : https://oradia.fr/precommande-oracle.html

À très bientôt,
Rudy Boucheron
        `;
    }
}

module.exports = new BrevoService();
