// lib/brevo-order-email.js
// Email de confirmation Brevo pour précommandes et dons (contribution-libre).
// Partagé entre api/stripe-webhook.js (envoi initial) et api/admin/index.js (renvoi manuel).

async function sendBrevoEmail({ toEmail, toName, offer, amountTotal, invoiceUrl = null }) {
    try {
        // Validation silencieuse des variables d'environnement
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        // Différencier don vs précommande
        const isDonation = offer === 'contribution-libre';
        const subject = isDonation
            ? 'Merci pour ton soutien à ORADIA'
            : 'Ta précommande ORADIA est confirmée';

        // Section facture PDF (seulement pour les précommandes avec facture)
        const invoiceSection = (!isDonation && invoiceUrl) ? `
              <!-- Téléchargement facture -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:4px;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 12px 0;color:#d4af37;font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;text-transform:uppercase;letter-spacing:1px;">
                      📄 Votre facture est disponible
                    </p>
                    <a href="${invoiceUrl}" style="display:inline-block;background:#d4af37;color:#0a1628;font-family:'Lora',Georgia,serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:4px;letter-spacing:0.5px;">
                      Télécharger la facture PDF
                    </a>
                  </td>
                </tr>
              </table>
        ` : '';

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME || 'ORADIA'
                },
                to: [{
                    email: toEmail,
                    name: toName
                }],
                replyTo: {
                    email: "contact@oradia.fr",
                    name: "Oradia"
                },
                subject: subject,
                htmlContent: `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;width:100%;background:#050a14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;background:#050a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="width:100%;padding:48px 20px;">

        <!-- Container principal -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(135deg, #0a1628 0%, #051428 100%);border:1px solid rgba(212,175,55,0.3);border-radius:0;box-shadow:0 8px 32px rgba(0,0,0,0.4);">

          <!-- Header avec image -->
          <tr>
            <td align="center" style="padding:0;position:relative;">
              <div style="position:relative;width:100%;height:240px;overflow:hidden;">
                <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" style="display:block;width:100%;height:240px;object-fit:cover;border:0;opacity:0.85;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg, rgba(5,10,20,0) 0%, rgba(5,10,20,0.95) 100%);"></div>
              </div>
            </td>
          </tr>

          <!-- Titre principal -->
          <tr>
            <td align="center" style="padding:32px 40px 24px 40px;">
              <h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">
                ${isDonation ? 'Gratitude' : 'Confirmation'}
              </h1>
              <div style="width:60px;height:1px;background:linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);margin:20px auto;"></div>
              <p style="margin:0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:15px;font-style:italic;line-height:1.6;letter-spacing:0.5px;">
                ${isDonation ? 'Merci pour ton soutien précieux' : 'Ta précommande est bien enregistrée'}
              </p>
            </td>
          </tr>

          <!-- Corps du message -->
          <tr>
            <td style="padding:0 40px 32px 40px;">

              <p style="margin:0 0 24px 0;color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">
                ${toName ? toName + ',' : 'Cher(e) ami(e),'}
              </p>

              <p style="margin:0 0 28px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                ${isDonation
                    ? 'Avec une profonde gratitude, nous te remercions pour ton soutien à ORADIA. Ta contribution nous aide à partager la sagesse de l\'Oracle avec celles et ceux qui en ont besoin.'
                    : 'C\'est avec joie que nous confirmons ta précommande. Ton Oracle sera façonné avec soin dès le lancement de la production. Tu fais partie des premiers à rejoindre cette aventure.'
                }
              </p>

              <!-- Encadré détails -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;background:rgba(17,24,43,0.6);border-left:3px solid #d4af37;backdrop-filter:blur(10px);">
                <tr>
                  <td style="padding:24px 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0 0 12px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                          ${isDonation ? 'Contribution' : 'Offre sélectionnée'}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 20px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;line-height:1.3;">
                          ${offer}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 0 0 0;border-top:1px solid rgba(212,175,55,0.2);color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:18px;font-weight:600;">
                          ${amountTotal} €
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${invoiceSection}

              <p style="margin:32px 0 0 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                ${isDonation
                    ? 'Ton soutien nous permet de poursuivre notre mission d\'accompagnement des âmes en quête de sens et de transformation.'
                    : 'Nous te tiendrons informé(e) de l\'avancement de la production et te recontacterons personnellement dès que ton Oracle sera prêt à rejoindre ton chemin.'
                }
              </p>

            </td>
          </tr>

          <!-- Séparateur décoratif -->
          <tr>
            <td align="center" style="padding:0 40px;">
              <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.3) 50%, transparent 100%);"></div>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td align="center" style="padding:40px 40px 48px 40px;">
              <p style="margin:0 0 8px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;letter-spacing:0.5px;">
                Avec toute ma gratitude,
              </p>
              <p style="margin:0 0 4px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;letter-spacing:1px;">
                Rudy
              </p>
              <p style="margin:0 0 24px 0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;">
                Fondateur d'ORADIA
              </p>
              <a href="https://oradia.fr" style="display:inline-block;color:#d4af37;text-decoration:none;font-family:'Lora',Georgia,serif;font-size:13px;letter-spacing:1px;border-bottom:1px solid rgba(212,175,55,0.4);padding-bottom:2px;transition:all 0.3s ease;">
                oradia.fr
              </a>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`,
                textContent: `${isDonation
    ? `Merci pour ton soutien à ORADIA

Bonjour${toName ? ' ' + toName : ''},

Avec profonde gratitude, nous vous remercions pour votre soutien à ORADIA. Votre contribution nous aide à partager la sagesse de l'Oracle avec plus de personnes.

Contribution : ${offer}
Montant : ${amountTotal}€

Ton soutien précieux nous permet de continuer notre mission d'accompagner les âmes sur leur chemin de transformation.

Merci du fond du cœur pour ta générosité et ta confiance en notre vision.

Avec toute notre gratitude,
Rudy
Fondateur d'ORADIA
oradia.fr`
    : `Ta précommande ORADIA est confirmée

Bonjour${toName ? ' ' + toName : ''},

C'est avec joie que nous confirmons ta précommande. Ton Oracle sera façonné avec soin dès le lancement de la production. Tu fais partie des premiers à rejoindre cette aventure.

Offre choisie : ${offer}
Montant : ${amountTotal}€

Nous te tiendrons informé(e) de l'avancement de la production et te recontacterons personnellement dès que ton Oracle sera prêt à rejoindre ton chemin.

Merci pour ta confiance et pour accueillir la sagesse d'ORADIA dans ta vie.

Avec toute ma gratitude,
Rudy
Fondateur d'ORADIA
oradia.fr`
}`
            })
        });

        if (!response.ok) {
            console.error(`Brevo API error: ${response.status}`);
            return false;
        }

        console.log('Email sent via Brevo');
        return true;

    } catch (error) {
        console.error('Failed to send email via Brevo:', error.message);
        return false; // Ne jamais faire planter le webhook
    }
}

// Email "commande expédiée" — envoyé automatiquement quand l'admin marque une précommande comme expédiée.
async function sendShippingEmail({ toEmail, toName, trackingNumber }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        const trackingUrl = `https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=${encodeURIComponent(trackingNumber)}`;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME || 'ORADIA'
                },
                to: [{ email: toEmail, name: toName }],
                replyTo: { email: "contact@oradia.fr", name: "Oradia" },
                subject: 'Ta commande ORADIA est en chemin',
                htmlContent: `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;width:100%;background:#050a14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;background:#050a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="width:100%;padding:48px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(135deg, #0a1628 0%, #051428 100%);border:1px solid rgba(212,175,55,0.3);border-radius:0;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <tr>
            <td align="center" style="padding:0;position:relative;">
              <div style="position:relative;width:100%;height:240px;overflow:hidden;">
                <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" style="display:block;width:100%;height:240px;object-fit:cover;border:0;opacity:0.85;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg, rgba(5,10,20,0) 0%, rgba(5,10,20,0.95) 100%);"></div>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 40px 24px 40px;">
              <h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">
                En chemin
              </h1>
              <div style="width:60px;height:1px;background:linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);margin:20px auto;"></div>
              <p style="margin:0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:15px;font-style:italic;line-height:1.6;letter-spacing:0.5px;">
                Ton Oracle ORADIA vient de partir vers toi
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <p style="margin:0 0 24px 0;color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">
                ${toName ? toName + ',' : 'Cher(e) ami(e),'}
              </p>
              <p style="margin:0 0 28px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                Bonne nouvelle : ta commande vient d'être confiée au transporteur. Tu peux suivre son acheminement avec le numéro de suivi ci-dessous.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;background:rgba(17,24,43,0.6);border-left:3px solid #d4af37;backdrop-filter:blur(10px);">
                <tr>
                  <td style="padding:24px 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0 0 12px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                          Numéro de suivi
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;line-height:1.3;">
                          ${trackingNumber}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${trackingUrl}" style="display:inline-block;background:#d4af37;color:#0a1628;font-family:'Lora',Georgia,serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:4px;letter-spacing:0.5px;">
                      Suivre mon colis
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                Merci pour ta confiance et pour accueillir la sagesse d'ORADIA dans ta vie.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px;">
              <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.3) 50%, transparent 100%);"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:40px 40px 48px 40px;">
              <p style="margin:0 0 8px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;letter-spacing:0.5px;">
                Avec toute ma gratitude,
              </p>
              <p style="margin:0 0 4px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;letter-spacing:1px;">
                Rudy
              </p>
              <p style="margin:0 0 24px 0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;">
                Fondateur d'ORADIA
              </p>
              <a href="https://oradia.fr" style="display:inline-block;color:#d4af37;text-decoration:none;font-family:'Lora',Georgia,serif;font-size:13px;letter-spacing:1px;border-bottom:1px solid rgba(212,175,55,0.4);padding-bottom:2px;">
                oradia.fr
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
                textContent: `Ta commande ORADIA est en chemin

Bonjour${toName ? ' ' + toName : ''},

Bonne nouvelle : ta commande vient d'être confiée au transporteur.

Numéro de suivi : ${trackingNumber}
Suivre ton colis : ${trackingUrl}

Merci pour ta confiance et pour accueillir la sagesse d'ORADIA dans ta vie.

Avec toute ma gratitude,
Rudy
Fondateur d'ORADIA
oradia.fr`
            })
        });

        if (!response.ok) {
            console.error(`Brevo API error: ${response.status}`);
            return false;
        }

        console.log('Shipping email sent via Brevo');
        return true;

    } catch (error) {
        console.error('Failed to send shipping email via Brevo:', error.message);
        return false;
    }
}

// Email mensuel d'export des données — envoie les exports CSV en pièces jointes à l'admin.
// files: [{ name: 'preorders.csv', content: '<csv en texte brut>' }, ...]
async function sendExportEmail({ toEmail, files }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME || 'ORADIA'
                },
                to: [{ email: toEmail }],
                subject: `Export mensuel ORADIA — ${monthLabel}`,
                htmlContent: `<p>Bonjour,</p><p>Voici l'export mensuel automatique des données ORADIA (${monthLabel}) en pièces jointes : ${files.map(f => f.name).join(', ')}.</p>`,
                textContent: `Export mensuel ORADIA — ${monthLabel}\n\nFichiers joints : ${files.map(f => f.name).join(', ')}`,
                attachment: files.map(f => ({
                    name: f.name,
                    content: Buffer.from(f.content, 'utf8').toString('base64')
                }))
            })
        });

        if (!response.ok) {
            console.error(`Brevo API error: ${response.status}`);
            return false;
        }

        console.log('Export email sent via Brevo');
        return true;

    } catch (error) {
        console.error('Failed to send export email via Brevo:', error.message);
        return false;
    }
}

// Email "commande prête à récupérer" — pour les commandes en remise en main propre.
async function sendReadyEmail({ toEmail, toName }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: {
                    email: process.env.BREVO_SENDER_EMAIL,
                    name: process.env.BREVO_SENDER_NAME || 'ORADIA'
                },
                to: [{ email: toEmail, name: toName }],
                replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
                subject: 'Ton Oracle ORADIA est prêt à être récupéré',
                htmlContent: `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;width:100%;background:#050a14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;background:#050a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="width:100%;padding:48px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(135deg, #0a1628 0%, #051428 100%);border:1px solid rgba(212,175,55,0.3);box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <tr>
            <td align="center" style="padding:0;">
              <div style="position:relative;width:100%;height:240px;overflow:hidden;">
                <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" style="display:block;width:100%;height:240px;object-fit:cover;border:0;opacity:0.85;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg, rgba(5,10,20,0) 0%, rgba(5,10,20,0.95) 100%);"></div>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 40px 24px 40px;">
              <h1 style="margin:0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">
                Prêt à partir
              </h1>
              <div style="width:60px;height:1px;background:linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);margin:20px auto;"></div>
              <p style="margin:0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:15px;font-style:italic;line-height:1.6;letter-spacing:0.5px;">
                Ton Oracle ORADIA t'attend
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <p style="margin:0 0 24px 0;color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">
                ${toName ? toName + ',' : 'Cher(e) ami(e),'}
              </p>
              <p style="margin:0 0 28px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                Bonne nouvelle : ton Oracle ORADIA est prêt et n'attend plus que toi. Tu avais choisi la remise en main propre — contacte-moi pour convenir du moment qui t'arrange.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
                <tr>
                  <td align="center">
                    <a href="mailto:contact@oradia.fr" style="display:inline-block;background:#d4af37;color:#0a1628;font-family:'Lora',Georgia,serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:4px;letter-spacing:0.5px;">
                      Me contacter
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                Merci pour ta confiance et pour accueillir la sagesse d'ORADIA dans ta vie.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px;">
              <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.3) 50%, transparent 100%);"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:40px 40px 48px 40px;">
              <p style="margin:0 0 8px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;letter-spacing:0.5px;">Avec toute ma gratitude,</p>
              <p style="margin:0 0 4px 0;color:#f0c75e;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;letter-spacing:1px;">Rudy</p>
              <p style="margin:0 0 24px 0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:13px;font-style:italic;">Fondateur d'ORADIA</p>
              <a href="https://oradia.fr" style="display:inline-block;color:#d4af37;text-decoration:none;font-family:'Lora',Georgia,serif;font-size:13px;letter-spacing:1px;border-bottom:1px solid rgba(212,175,55,0.4);padding-bottom:2px;">oradia.fr</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
                textContent: `Ton Oracle ORADIA est prêt à être récupéré\n\nBonjour${toName ? ' ' + toName : ''},\n\nBonne nouvelle : ton Oracle ORADIA est prêt et n'attend plus que toi. Tu avais choisi la remise en main propre — contacte-moi pour convenir du moment qui t'arrange.\n\ncontact@oradia.fr\n\nAvec toute ma gratitude,\nRudy\nFondateur d'ORADIA\noradia.fr`
            })
        });

        if (!response.ok) {
            console.error(`Brevo API error: ${response.status}`);
            return false;
        }

        console.log('Ready email sent via Brevo');
        return true;

    } catch (error) {
        console.error('Failed to send ready email via Brevo:', error.message);
        return false;
    }
}

module.exports = { sendBrevoEmail, sendShippingEmail, sendExportEmail, sendReadyEmail };
