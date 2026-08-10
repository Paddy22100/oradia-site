// lib/guidance-email.js
// Email de confirmation d'une guidance par visio (lien Jitsi).
// Partagé entre api/stripe-webhook.js (handleCalWebhook, envoi réel après réservation
// Cal.com) et api/admin/index.js (bouton "Envoyer test" de l'onglet Mails).

async function sendGuidanceConfirmationEmail({ clientEmail, clientName, duration, dateStr, jitsiUrl }) {
    if (!clientEmail || !process.env.BREVO_API_KEY) return false;
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender: { email: process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr', name: 'Rudy · Oradia' },
                to: [{ email: clientEmail, name: clientName }],
                replyTo: { email: 'contact@oradia.fr', name: 'Rudy · Oradia' },
                subject: `Rudy d'Oradia - Votre lien de connexion — Guidance Oradia du ${dateStr}`,
                htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#050a14;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050a14;padding:48px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:linear-gradient(135deg,#0a1628,#051428);border:1px solid rgba(212,175,55,0.3);border-radius:4px;">
        <tr><td align="center" style="padding:48px 40px 24px;">
          <p style="margin:0 0 6px;color:rgba(212,175,55,0.5);font-family:Georgia,serif;font-size:11px;letter-spacing:0.45em;text-transform:uppercase;">Guidance par visio</p>
          <h1 style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:36px;font-weight:300;letter-spacing:2px;">ORADIA</h1>
          <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:20px auto;"></div>
        </td></tr>
        <tr><td style="padding:0 40px 32px;">
          <p style="color:#e8e9eb;font-family:Georgia,serif;font-size:16px;line-height:1.8;">${clientName ? clientName + ',' : 'Bonjour,'}</p>
          <p style="color:rgba(200,192,168,0.55);font-family:Georgia,serif;font-size:13px;line-height:1.7;font-style:italic;margin-bottom:16px;">Vous avez reçu un email de confirmation de Cal.com avec l'invitation calendrier. Cet email contient votre lien personnel pour rejoindre la visio.</p>
          <p style="color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.9;">Votre guidance de <strong style="color:#f0c75e;">${duration} minutes</strong> est prévue le <strong style="color:#f0c75e;">${dateStr}</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:4px;margin:24px 0;">
            <tr><td style="padding:24px;">
              <p style="margin:0 0 8px;color:rgba(212,175,55,0.6);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Date &amp; heure</p>
              <p style="margin:0 0 20px;color:#f0c75e;font-family:Georgia,serif;font-size:17px;">${dateStr}</p>
              <p style="margin:0 0 8px;color:rgba(212,175,55,0.6);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Lien de connexion</p>
              <a href="${jitsiUrl}" style="color:#f0c75e;font-family:Georgia,serif;font-size:14px;word-break:break-all;">${jitsiUrl}</a>
            </td></tr>
          </table>
          <p style="color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;">Cliquez sur le lien au moment du rendez-vous pour rejoindre la visio. Aucune installation requise.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
            <tr><td align="center">
              <a href="${jitsiUrl}" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a1628;font-family:Georgia,serif;font-size:16px;font-weight:600;text-decoration:none;padding:16px 40px;border-radius:50px;">Rejoindre la visio</a>
            </td></tr>
          </table>
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
        <tr><td align="center" style="padding:36px 32px 28px;border-top:1px solid rgba(212,175,55,0.15);">
          <p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">Avec gratitude,</p>
          <p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
          <p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">Fondateur d'Oradia</p>
          <p style="margin:0 0 12px;text-align:center;"><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4));vertical-align:middle;"></span><span style="display:inline-block;width:5px;height:5px;background:#d4af37;border-radius:50%;opacity:0.45;vertical-align:middle;margin:0 8px;"></span><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent);vertical-align:middle;"></span></p>
          <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.png" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.png" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://www.youtube.com/@oradiafr" target="_blank"><img src="https://oradia.fr/images/medias/icon-youtube.png" alt="YouTube" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
                textContent: `Guidance Oradia confirmée\n\nDate : ${dateStr}\nDurée : ${duration} minutes\nLien Jitsi : ${jitsiUrl}\n\nCliquez sur le lien au moment du rendez-vous.\n\nOradia — oradia.fr`
            })
        });
        return response.ok;
    } catch (e) {
        console.error('[cal-webhook] Email client:', e.message);
        return false;
    }
}

module.exports = { sendGuidanceConfirmationEmail };
