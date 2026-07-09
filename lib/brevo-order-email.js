// lib/brevo-order-email.js
// Email de confirmation Brevo pour précommandes et dons (contribution-libre).
// Partagé entre api/stripe-webhook.js (envoi initial) et api/admin/index.js (renvoi manuel).

// Génère le HTML commun à tous les emails transactionnels.
// body : contenu HTML inséré entre le sous-titre et la signature.
function buildEmailHtml({ title, subtitle, body }) {
  return `<!DOCTYPE html>
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
    @media only screen and (max-width:620px) {
      .container { width:100% !important; }
      .pad { padding:24px 20px !important; }
      .pad-body { padding:0 20px 24px !important; }
      .h1 { font-size:26px !important; }
      .btn { padding:13px 20px !important; font-size:13px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center top;" bgcolor="#050a14">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" background="https://oradia.fr/images/oradia-hero-4k.png" bgcolor="#050a14" style="background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center top;">
    <tr>
      <td align="center" style="padding:32px 16px;background-color:rgba(5,10,20,0.72);" bgcolor="#050a14">

        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">

          <!-- Image header -->
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;">
            </td>
          </tr>

          <!-- Titre -->
          <tr>
            <td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
              <h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">${title}</h1>
              <table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;">
                <tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
              </table>
              <p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">${subtitle}</p>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
              ${body}
            </td>
          </tr>

          <!-- Séparateur -->
          <tr>
            <td style="padding:0 40px;" bgcolor="#0a1628">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td align="center" style="padding:28px 40px 32px;" bgcolor="#0a1628">
              <p style="margin:0 0 6px;color:#9ca3af;font-family:Georgia,serif;font-size:13px;font-style:italic;">Avec toute ma gratitude,</p>
              <p style="margin:0 0 4px;color:#f0c75e;font-family:Georgia,serif;font-size:26px;font-weight:bold;letter-spacing:1px;">Rudy</p>
              <p style="margin:0 0 16px;color:#d8bf72;font-family:Georgia,serif;font-size:13px;font-style:italic;">Fondateur d'ORADIA</p>
              <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-family:Georgia,serif;font-size:13px;letter-spacing:1px;border-bottom:1px solid #8a6d20;padding-bottom:2px;">oradia.fr</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:20px 40px;" bgcolor="#040c1a">
              <p style="margin:0 0 8px;color:#9ca3af;font-family:Georgia,serif;font-size:12px;line-height:1.6;">
                <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:contact@oradia.fr" style="color:#d4af37;text-decoration:none;">contact@oradia.fr</a>
              </p>
              <p style="margin:0;color:#6b7280;font-family:Georgia,serif;font-size:11px;line-height:1.5;">ORADIA - La Boussole Intérieure<br>Révéler. Transmuter. Relier.</p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendBrevoEmail({ toEmail, toName, offer, amountTotal, invoiceUrl = null }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        const isDonation = offer === 'contribution-libre';
        const subject = isDonation
            ? 'Merci pour ton soutien à ORADIA'
            : 'Ta précommande ORADIA est confirmée';

        const invoiceSection = (!isDonation && invoiceUrl) ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;" bgcolor="#0f1d35">
            <tr>
              <td style="padding:2px;border:1px solid #8a6d20;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f1d35">
                  <tr>
                    <td align="center" style="padding:18px 24px;">
                      <p style="margin:0 0 10px;color:#d4af37;font-family:Georgia,serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Votre facture est disponible</p>
                      <a href="${invoiceUrl}" class="btn" style="display:inline-block;background-color:#d4af37;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 24px;letter-spacing:0.5px;">Télécharger la facture PDF</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>` : '';

        const body = `
          <p style="margin:0 0 20px;color:#e8e9eb;font-family:Georgia,serif;font-size:15px;line-height:1.8;">${toName ? toName + ',' : 'Cher(e) ami(e),'}</p>
          <p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.9;">
            ${isDonation
              ? "Avec une profonde gratitude, nous te remercions pour ton soutien à ORADIA. Ta contribution nous aide à partager la sagesse de l'Oracle avec celles et ceux qui en ont besoin."
              : "C'est avec joie que nous confirmons ta précommande. Ton Oracle sera façonné avec soin dès le lancement de la production. Tu fais partie des premiers à rejoindre cette aventure."
            }
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-left:3px solid #d4af37;" bgcolor="#0f1d35">
            <tr>
              <td style="padding:22px 28px;">
                <p style="margin:0 0 10px;color:#9ca3af;font-family:Georgia,serif;font-size:12px;text-transform:uppercase;letter-spacing:1px;">${isDonation ? 'Contribution' : 'Offre sélectionnée'}</p>
                <p style="margin:0 0 16px;color:#f0c75e;font-family:Georgia,serif;font-size:20px;font-weight:bold;line-height:1.3;">${offer}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td height="1" bgcolor="#1a2d47" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
                </table>
                <p style="margin:14px 0 0;color:#e8e9eb;font-family:Georgia,serif;font-size:17px;font-weight:bold;">${amountTotal} €</p>
              </td>
            </tr>
          </table>

          ${invoiceSection}

          <p style="margin:0;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.9;">
            ${isDonation
              ? "Ton soutien nous permet de poursuivre notre mission d'accompagnement des âmes en quête de sens et de transformation."
              : "Nous te tiendrons informé(e) de l'avancement de la production et te recontacterons personnellement dès que ton Oracle sera prêt à rejoindre ton chemin."
            }
          </p>`;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to: [{ email: toEmail, name: toName }],
                replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
                subject,
                htmlContent: buildEmailHtml({
                    title: isDonation ? 'Gratitude' : 'Confirmation',
                    subtitle: isDonation ? 'Merci pour ton soutien précieux' : 'Ta précommande est bien enregistrée',
                    body
                }),
                textContent: isDonation
                    ? `Merci pour ton soutien à ORADIA\n\nBonjour${toName ? ' ' + toName : ''},\n\nAvec profonde gratitude, nous te remercions pour ton soutien. Contribution : ${offer} — ${amountTotal}€\n\nAvec toute notre gratitude,\nRudy\noradia.fr`
                    : `Ta précommande ORADIA est confirmée\n\nBonjour${toName ? ' ' + toName : ''},\n\nOffre : ${offer} — ${amountTotal}€\n\nNous te recontacterons dès que ton Oracle sera prêt.\n\nAvec toute ma gratitude,\nRudy\noradia.fr`
            })
        });

        if (!response.ok) { console.error(`Brevo API error: ${response.status}`); return false; }
        console.log('Email sent via Brevo');
        return true;
    } catch (error) {
        console.error('Failed to send email via Brevo:', error.message);
        return false;
    }
}

async function sendShippingEmail({ toEmail, toName, trackingNumber }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        const trackingUrl = `https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=${encodeURIComponent(trackingNumber)}`;

        const body = `
          <p style="margin:0 0 20px;color:#e8e9eb;font-family:Georgia,serif;font-size:15px;line-height:1.8;">${toName ? toName + ',' : 'Cher(e) ami(e),'}</p>
          <p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.9;">
            Bonne nouvelle : ta commande vient d'être confiée au transporteur. Tu peux suivre son acheminement avec le numéro de suivi ci-dessous.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-left:3px solid #d4af37;" bgcolor="#0f1d35">
            <tr>
              <td style="padding:22px 28px;">
                <p style="margin:0 0 10px;color:#9ca3af;font-family:Georgia,serif;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Numéro de suivi</p>
                <p style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:20px;font-weight:bold;">${trackingNumber}</p>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
            <tr>
              <td align="center">
                <a href="${trackingUrl}" class="btn" style="display:inline-block;background-color:#d4af37;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;text-decoration:none;padding:14px 28px;letter-spacing:0.5px;">Suivre mon colis</a>
              </td>
            </tr>
          </table>

          <p style="margin:0;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.9;">Merci pour ta confiance et pour accueillir la sagesse d'ORADIA dans ta vie.</p>`;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to: [{ email: toEmail, name: toName }],
                replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
                subject: 'Ta commande ORADIA est en chemin',
                htmlContent: buildEmailHtml({
                    title: 'En chemin',
                    subtitle: 'Ton Oracle ORADIA vient de partir vers toi',
                    body
                }),
                textContent: `Ta commande ORADIA est en chemin\n\nBonjour${toName ? ' ' + toName : ''},\n\nNuméro de suivi : ${trackingNumber}\nSuivre ton colis : ${trackingUrl}\n\nAvec toute ma gratitude,\nRudy\noradia.fr`
            })
        });

        if (!response.ok) { console.error(`Brevo API error: ${response.status}`); return false; }
        console.log('Shipping email sent via Brevo');
        return true;
    } catch (error) {
        console.error('Failed to send shipping email via Brevo:', error.message);
        return false;
    }
}

async function sendExportEmail({ toEmail, files }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to: [{ email: toEmail }],
                subject: `Export mensuel ORADIA — ${monthLabel}`,
                htmlContent: `<p>Bonjour,</p><p>Voici l'export mensuel automatique des données ORADIA (${monthLabel}) en pièces jointes : ${files.map(f => f.name).join(', ')}.</p>`,
                textContent: `Export mensuel ORADIA — ${monthLabel}\n\nFichiers joints : ${files.map(f => f.name).join(', ')}`,
                attachment: files.map(f => ({ name: f.name, content: Buffer.from(f.content, 'utf8').toString('base64') }))
            })
        });

        if (!response.ok) { console.error(`Brevo API error: ${response.status}`); return false; }
        console.log('Export email sent via Brevo');
        return true;
    } catch (error) {
        console.error('Failed to send export email via Brevo:', error.message);
        return false;
    }
}

async function sendReadyEmail({ toEmail, toName }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
            console.error('Configuration Brevo manquante');
            return false;
        }

        const body = `
          <p style="margin:0 0 20px;color:#e8e9eb;font-family:Georgia,serif;font-size:15px;line-height:1.8;">${toName ? toName + ',' : 'Cher(e) ami(e),'}</p>
          <p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.9;">
            Bonne nouvelle : ton Oracle ORADIA est prêt et n'attend plus que toi. Tu avais choisi la remise en main propre — contacte-moi pour convenir du moment qui t'arrange.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
            <tr>
              <td align="center">
                <a href="mailto:contact@oradia.fr" class="btn" style="display:inline-block;background-color:#d4af37;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;text-decoration:none;padding:14px 28px;letter-spacing:0.5px;">Me contacter</a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.9;">Merci pour ta confiance et pour accueillir la sagesse d'ORADIA dans ta vie.</p>`;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to: [{ email: toEmail, name: toName }],
                replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
                subject: 'Ton Oracle ORADIA est prêt à être récupéré',
                htmlContent: buildEmailHtml({
                    title: 'Prêt à partir',
                    subtitle: "Ton Oracle ORADIA t'attend",
                    body
                }),
                textContent: `Ton Oracle ORADIA est prêt à être récupéré\n\nBonjour${toName ? ' ' + toName : ''},\n\nTon Oracle est prêt. Contacte-moi pour convenir du moment : contact@oradia.fr\n\nAvec toute ma gratitude,\nRudy\noradia.fr`
            })
        });

        if (!response.ok) { console.error(`Brevo API error: ${response.status}`); return false; }
        console.log('Ready email sent via Brevo');
        return true;
    } catch (error) {
        console.error('Failed to send ready email via Brevo:', error.message);
        return false;
    }
}

module.exports = { sendBrevoEmail, sendShippingEmail, sendExportEmail, sendReadyEmail };
