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
    async sendTirageAnalysis({ email, intention, cards, analysis, synthesis }) {
        const html = this.generateTirageAnalysisHTML({ intention, cards, analysis, synthesis });
        const text = this.generateTirageAnalysisText({ intention, cards, analysis, synthesis });

        const mailOptions = {
            from: this.fromEmail,
            to: email,
            subject: '✨ Votre analyse Oradia — Les cartes ont parlé',
            text,
            html
        };

        const info = await this.transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
    }

    generateTirageAnalysisHTML({ intention, cards, analysis, synthesis }) {
        const familyLabel = f => ({
            emotions: 'Émotion', besoins: 'Besoin', transmutation: 'Transmutation',
            memoire_cosmos: 'Mémoire Cosmos', revelation: 'Révélation',
            portail: 'Portail', archetypes: 'Archétype', actions: 'Actions'
        }[f] || f.replace(/_/g, ' '));

        const cardsHTML = (cards || []).map(card => `
            <tr>
                <td align="center" style="padding: 8px 4px;">
                    <table cellpadding="0" cellspacing="0" style="display:inline-block;">
                        <tr>
                            <td align="center" style="background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.3); border-radius:12px; padding:14px 18px; min-width:120px;">
                                <p style="color:rgba(212,175,55,0.7); font-family:Georgia,serif; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; margin:0 0 6px;">${familyLabel(card.family)}</p>
                                <p style="color:#f5e7a1; font-family:Georgia,serif; font-size:13px; font-weight:bold; margin:0;">${(card.name || '').replace(/_/g, ' ')}</p>
                                ${card.bridgeCard ? `
                                <p style="color:rgba(196,181,253,0.8); font-family:Georgia,serif; font-size:10px; margin:8px 0 0; border-top:1px solid rgba(212,175,55,0.2); padding-top:8px;">⟳ Passerelle<br><strong>${(card.bridgeCard.name || '').replace(/_/g, ' ')}</strong></p>
                                ` : ''}
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>`).join('');

        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Votre analyse Oradia</title>
</head>
<body style="margin:0; padding:0; background-color:#030a16; font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#030a16;">
    <tr><td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

            <!-- EN-TÊTE -->
            <tr>
                <td align="center" style="background:linear-gradient(160deg,#0a192f 0%,#030a16 100%); border:1px solid rgba(212,175,55,0.35); border-bottom:none; border-radius:20px 20px 0 0; padding:44px 32px 32px;">
                    <p style="color:rgba(212,175,55,0.5); font-size:11px; letter-spacing:0.35em; text-transform:uppercase; margin:0 0 10px;">Oracle</p>
                    <h1 style="color:#d4af37; font-size:36px; font-weight:400; letter-spacing:0.08em; margin:0; font-family:Georgia,serif;">ORADIA</h1>
                    <div style="width:48px; height:1px; background:linear-gradient(90deg,transparent,rgba(212,175,55,0.6),transparent); margin:16px auto;"></div>
                    <p style="color:rgba(245,231,161,0.65); font-size:14px; font-style:italic; margin:0; letter-spacing:0.05em;">La Boussole Intérieure</p>
                </td>
            </tr>

            <!-- INTENTION -->
            <tr>
                <td style="background:linear-gradient(160deg,#0a1628 0%,#030a16 100%); border-left:1px solid rgba(212,175,55,0.35); border-right:1px solid rgba(212,175,55,0.35); padding:28px 36px 20px;">
                    <p style="color:rgba(212,175,55,0.55); font-size:10px; text-transform:uppercase; letter-spacing:0.25em; margin:0 0 10px;">Votre intention</p>
                    <p style="color:#f5e7a1; font-size:16px; line-height:1.7; margin:0; padding:16px 20px; background:rgba(212,175,55,0.06); border-left:3px solid rgba(212,175,55,0.4); border-radius:0 8px 8px 0; font-style:italic;">${intention || 'Question personnelle'}</p>
                </td>
            </tr>

            <!-- CARTES -->
            <tr>
                <td style="background:linear-gradient(160deg,#0a1628 0%,#030a16 100%); border-left:1px solid rgba(212,175,55,0.35); border-right:1px solid rgba(212,175,55,0.35); padding:24px 36px;">
                    <p style="color:rgba(212,175,55,0.55); font-size:10px; text-transform:uppercase; letter-spacing:0.25em; margin:0 0 16px;">Cartes tirées</p>
                    <table width="100%" cellpadding="0" cellspacing="0">${cardsHTML}</table>
                </td>
            </tr>

            <!-- SÉPARATEUR DORÉ -->
            <tr>
                <td style="background:linear-gradient(160deg,#0a1628 0%,#030a16 100%); border-left:1px solid rgba(212,175,55,0.35); border-right:1px solid rgba(212,175,55,0.35); padding:0 36px;">
                    <div style="width:100%; height:1px; background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4),transparent); margin:8px 0;"></div>
                </td>
            </tr>

            <!-- ANALYSE -->
            ${analysis ? `
            <tr>
                <td style="background:linear-gradient(160deg,#0a1628 0%,#030a16 100%); border-left:1px solid rgba(212,175,55,0.35); border-right:1px solid rgba(212,175,55,0.35); padding:24px 36px;">
                    <p style="color:rgba(212,175,55,0.55); font-size:10px; text-transform:uppercase; letter-spacing:0.25em; margin:0 0 14px;">Message de l'Oracle</p>
                    <p style="color:#e9e7df; font-size:14px; line-height:1.85; margin:0;">${analysis}</p>
                </td>
            </tr>` : ''}

            <!-- SYNTHÈSE -->
            ${synthesis ? `
            <tr>
                <td style="background:linear-gradient(160deg,#0a1628 0%,#030a16 100%); border-left:1px solid rgba(212,175,55,0.35); border-right:1px solid rgba(212,175,55,0.35); padding:24px 36px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.06); border:1px solid rgba(212,175,55,0.2); border-radius:12px;">
                        <tr>
                            <td style="padding:22px 24px;">
                                <p style="color:rgba(212,175,55,0.7); font-size:10px; text-transform:uppercase; letter-spacing:0.25em; margin:0 0 12px;">Synthèse</p>
                                <p style="color:#f5e7a1; font-size:14px; line-height:1.85; margin:0; font-style:italic;">${synthesis}</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>` : ''}

            <!-- CTA -->
            <tr>
                <td align="center" style="background:linear-gradient(160deg,#0a1628 0%,#030a16 100%); border-left:1px solid rgba(212,175,55,0.35); border-right:1px solid rgba(212,175,55,0.35); padding:28px 36px 36px;">
                    <a href="https://oradia.fr/tore.html" style="display:inline-block; background:linear-gradient(135deg,#d4af37 0%,#f5e7a1 50%,#d4af37 100%); color:#030a16; text-decoration:none; padding:15px 40px; border-radius:50px; font-family:Georgia,serif; font-weight:bold; font-size:14px; letter-spacing:0.06em;">Nouveau tirage</a>
                </td>
            </tr>

            <!-- PIED DE PAGE -->
            <tr>
                <td align="center" style="background:#020710; border:1px solid rgba(212,175,55,0.2); border-top:1px solid rgba(212,175,55,0.15); border-radius:0 0 20px 20px; padding:24px 32px;">
                    <p style="color:rgba(245,231,161,0.35); font-size:11px; line-height:1.7; margin:0;">
                        © Oradia — La Boussole Intérieure<br>
                        Cet email vous a été envoyé suite à votre demande.<br>
                        <a href="https://oradia.fr" style="color:rgba(212,175,55,0.45); text-decoration:none;">oradia.fr</a>
                    </p>
                </td>
            </tr>

        </table>
    </td></tr>
</table>
</body>
</html>`;
    }

    generateTirageAnalysisText({ intention, cards, analysis, synthesis }) {
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
                                L'équipe Oradia
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
L'équipe Oradia

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
                                L'équipe Oradia
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
L'équipe Oradia
        `;
    }
}

module.exports = new BrevoService();
