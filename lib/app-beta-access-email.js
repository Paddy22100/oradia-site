// lib/app-beta-access-email.js
// Email envoyé manuellement depuis le dashboard admin (Répertoire → Demandes
// d'accès bêta) une fois qu'une personne a été ajoutée au groupe Google
// utilisé par la piste "Tests fermés" de l'app Android (aucune API ne permet
// d'automatiser cet ajout pour un compte Google personnel — voir discussion
// dans le dashboard). Contient le vrai lien Play Store, à envoyer seulement
// une fois l'ajout fait, sinon la personne retombe sur "Élément introuvable".

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=fr.oradia.app';

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendAppBetaAccessEmail({ email, name }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'ORADIA';
  if (!apiKey || !senderEmail) {
    console.warn('[AppBetaAccess] Config Brevo manquante');
    return false;
  }

  const greeting = name ? `Bonjour ${escapeHtml(name)},` : 'Bonjour,';

  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#0a192f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a192f" style="background-color:#0a192f;">
    <tr>
      <td align="center" style="padding:40px 24px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;" bgcolor="#0a192f">
          <tr>
            <td align="center" style="padding:0 0 28px;">
              <img src="https://oradia.fr/images/logo-hd-v2.jpeg" alt="Oradia" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:50%;border:2px solid #6b5b28;">
              <p style="margin:12px 0 0;color:#d4af37;font-family:Georgia,serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">
                Accès bêta activé
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#162230" style="background-color:#162230;border:1px solid #3a3020;border-radius:12px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 14px;color:#e9e7df;font-family:Georgia,serif;font-size:15px;line-height:1.8;">${greeting}</p>
                    <p style="margin:0 0 14px;color:#e9e7df;font-family:Georgia,serif;font-size:15px;line-height:1.8;">Votre accès à la bêta de l'application Oradia est prêt. Vous pouvez l'installer dès maintenant depuis Google Play :</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 0 28px;">
              <a href="${PLAY_STORE_URL}" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a192f;text-decoration:none;padding:15px 36px;border-radius:50px;font-weight:700;font-size:15px;letter-spacing:0.05em;font-family:Georgia,serif;">
                Installer Oradia sur Google Play
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 24px;">
              <p style="margin:0;color:#8a7a52;font-family:Georgia,serif;font-size:12.5px;line-height:1.7;">
                L'application est encore en phase de test : si quelque chose ne fonctionne pas comme prévu, un bouton "Un problème ? Une idée ?" est disponible directement dans l'app pour me le signaler.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3020" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 0 0;">
              <p style="margin:0 0 4px;color:#c8c0a8;font-size:12px;font-style:italic;opacity:0.75;font-family:Georgia,serif;">Avec gratitude,</p>
              <p style="margin:0 0 2px;color:#d4af37;font-size:34px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;">Rudy</p>
              <p style="margin:8px 0 0;color:#8a7a52;font-family:Georgia,serif;font-size:11px;text-align:center;">
                <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `${name ? 'Bonjour ' + name : 'Bonjour'},\n\nVotre accès à la bêta de l'application Oradia est prêt. Installez-la depuis Google Play : ${PLAY_STORE_URL}\n\nL'application est encore en phase de test : un bouton "Un problème ? Une idée ?" est disponible dans l'app pour tout signaler.\n\nAvec gratitude,\nRudy`;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email, name: name || undefined }],
        replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
        subject: "Rudy d'Oradia - Votre accès à la bêta de l'application est prêt",
        htmlContent,
        textContent
      })
    });
    if (!response.ok) {
      console.error('[AppBetaAccess] Brevo error:', response.status, await response.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[AppBetaAccess] exception:', err.message);
    return false;
  }
}

module.exports = { sendAppBetaAccessEmail, PLAY_STORE_URL };
