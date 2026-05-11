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
