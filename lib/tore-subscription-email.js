// lib/tore-subscription-email.js
// Email de bienvenue / accès pour les abonnés Le Tore.
// Partagé entre api/stripe-webhook.js (activation automatique, y compris le filet
// de sécurité invoice.payment_succeeded) et api/admin/index.js (réparation manuelle
// d'un accès cassé depuis le dashboard admin).

async function sendToreSubscriptionEmail({ toEmail, toName, tempPassword, resetLink, plan }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return false;

        // Section accès — 3 cas possibles :
        // 1. Nouveau compte créé avec succès → mot de passe provisoire (à remplacer à la 1ère connexion)
        // 2. Compte déjà existant (réabonnement) → invite à se connecter avec les identifiants connus
        // 3. Création du compte échouée côté serveur, ou réparation manuelle d'un accès cassé →
        //    lien sécurisé pour définir un mot de passe (on n'envoie jamais un mot de passe qui
        //    ne correspond pas au compte réel)
        let accessSection, textAccess;
        if (tempPassword) {
            accessSection = `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.14),rgba(212,175,55,0.05));border:1px solid rgba(212,175,55,0.35);border-radius:14px;margin-bottom:28px;">
            <tr><td align="center" style="padding:26px 28px;">
              <p style="margin:0 0 14px;color:rgba(212,175,55,0.65);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Votre mot de passe provisoire</p>
              <p style="margin:0;color:#f0c75e;font-family:'Courier New',monospace;font-size:24px;font-weight:700;letter-spacing:0.15em;padding:12px 22px;background:rgba(10,22,45,0.45);border:1px solid rgba(212,175,55,0.25);border-radius:10px;">${tempPassword}</p>
              <p style="margin:14px 0 0;color:#c8c0a8;font-family:Georgia,serif;font-size:12px;line-height:1.6;">Connectez-vous avec l'adresse <strong style="color:#e8d9a8;">${toEmail}</strong> et ce mot de passe. Il vous sera demandé de le remplacer par un mot de passe définitif dès votre première connexion.</p>
            </td></tr>
          </table>`;
            textAccess = `\nAdresse de connexion : ${toEmail}\nVotre mot de passe provisoire : ${tempPassword}\nIl vous sera demandé de le remplacer dès votre première connexion.\n`;
        } else if (resetLink) {
            accessSection = `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.14),rgba(212,175,55,0.05));border:1px solid rgba(212,175,55,0.35);border-radius:14px;margin-bottom:28px;">
            <tr><td align="center" style="padding:26px 28px;">
              <p style="margin:0 0 16px;color:rgba(212,175,55,0.65);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Définir votre mot de passe</p>
              <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;padding:14px 32px;border-radius:6px;">Choisir mon mot de passe</a>
              <p style="margin:16px 0 0;color:#c8c0a8;font-family:Georgia,serif;font-size:12px;line-height:1.6;">Ce lien est à usage unique. Une fois votre mot de passe défini, connectez-vous avec l'adresse <strong style="color:#e8d9a8;">${toEmail}</strong>.</p>
            </td></tr>
          </table>`;
            textAccess = `\nDéfinissez votre mot de passe : ${resetLink}\nPuis connectez-vous avec l'adresse : ${toEmail}\n`;
        } else {
            accessSection = `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.10),rgba(212,175,55,0.03));border:1px solid rgba(212,175,55,0.28);border-radius:14px;margin-bottom:28px;">
            <tr><td align="center" style="padding:24px 28px;">
              <p style="margin:0 0 10px;color:rgba(212,175,55,0.6);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Vos accès</p>
              <p style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:15px;line-height:1.6;">
                Connectez-vous avec l'adresse <strong>${toEmail}</strong> et votre mot de passe habituel
              </p>
            </td></tr>
          </table>`;
            textAccess = `\nConnectez-vous avec l'adresse ${toEmail} et votre mot de passe habituel.\n`;
        }

        const loginUrl = 'https://oradia.fr/member/login.html?returnTo=%2Ftore.html';

        // Le bouton "Accès direct" ne fait sens que si un mot de passe existe déjà pour ce
        // compte (cas tempPassword ou "mot de passe habituel"). En mode resetLink, le seul
        // CTA valable est "Choisir mon mot de passe" ci-dessus — un second bouton de connexion
        // serait un cul-de-sac pour quelqu'un qui n'a pas encore de mot de passe.
        const directAccessBlock = resetLink ? '' : `
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;text-align:justify;"><strong style="color:#f0c75e;">Accès direct :</strong> cliquez sur le bouton ci-dessous pour vous connecter à votre espace membre et commencer votre exploration.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr><td style="border-radius:6px;" bgcolor="#d4af37">
<a href="${loginUrl}" class="btn" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">Se connecter à mon espace</a>
</td></tr></table>`;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender:    { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to:        [{ email: toEmail, name: toName }],
                replyTo:   { email: 'contact@oradia.fr', name: 'Oradia' },
                subject:   plan === 'decouverte'
                    ? "Rudy d'Oradia - Bienvenue dans Le Tore — Formule Découverte activée"
                    : "Rudy d'Oradia - Bienvenue dans Le Tore — Votre abonnement est actif",
                htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}.h1{font-size:26px!important}.btn{padding:13px 20px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;" bgcolor="#050a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.png">
<tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;">
<table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">
<tr><td style="padding:0;line-height:0;font-size:0;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;"></td></tr>
<tr><td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
<h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">Abonnement activé</h1>
<table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
<p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">Bienvenue dans Le Tore</p>
</td></tr>
<tr><td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;text-align:justify;">${toName ? toName + ',' : 'Bonjour,'}<br><br>Votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> est maintenant actif. Vous avez accès illimité à l'expérience complète d'Oradia.</p>

${accessSection}
${directAccessBlock}

<p style="margin:24px 0 0;color:rgba(212,175,55,0.6);font-family:Georgia,serif;font-size:13px;line-height:1.6;">Votre abonnement se renouvelle automatiquement chaque mois. Vous pouvez le gérer à tout moment depuis votre espace membre.</p>
</td></tr>
<tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:0 24px 16px;" bgcolor="#0a1628">
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
<tr><td align="center" style="padding:36px 32px 28px;border-top:1px solid rgba(212,175,55,0.15);" bgcolor="#0a1628">
<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">Avec gratitude,</p>
<p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
<p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">Fondateur d'Oradia</p>
<p style="margin:0 0 12px;text-align:center;"><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4));vertical-align:middle;"></span><span style="display:inline-block;width:5px;height:5px;background:#d4af37;border-radius:50%;opacity:0.45;vertical-align:middle;margin:0 8px;"></span><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent);vertical-align:middle;"></span></p>
<a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.png" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.png" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`,
                textContent: `Bienvenue dans Le Tore\n\nVotre abonnement est maintenant actif.${textAccess}${resetLink ? '' : `\nSe connecter : ${loginUrl}\n`}\nVotre abonnement se renouvelle automatiquement chaque mois.\n\nOradia — oradia.fr`
            })
        });
        return response.ok;
    } catch(e) { console.error('sendToreSubscriptionEmail error:', e.message); return false; }
}

// Email envoyé en cas d'échec de prélèvement ou d'annulation d'abonnement.
// Partagé entre api/stripe-webhook.js (envoi réel) et api/admin/index.js
// (bouton "Envoyer test" de l'onglet Mails du dashboard).
async function sendSubscriptionEmail(toEmail, toName, type) {
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@oradia.fr';
    if (!BREVO_API_KEY || !senderEmail) return false;

    // 'payment_failed'        → échec sur un abonnement déjà actif (renouvellement mensuel)
    // 'payment_failed_first'  → échec du tout premier prélèvement d'un abonné qui a déjà un
    //                           compte existant (ex : réabonnement) — copie adaptée pour ne
    //                           pas parler de "renouvellement" à quelqu'un qui vient de s'inscrire
    // 'cancelled'              → abonnement annulé / expiré
    const isFirstPaymentFailed = type === 'payment_failed_first';
    const isPaimentFailed = type === 'payment_failed' || isFirstPaymentFailed;
    const subject = isFirstPaymentFailed
        ? "Rudy d'Oradia - Votre paiement n'a pas abouti — activer votre accès"
        : isPaimentFailed
        ? "Rudy d'Oradia - Votre paiement n'a pas abouti — renouveler votre accès"
        : "Rudy d'Oradia - Votre abonnement Le Tore est arrivé à échéance";
    const title = isPaimentFailed ? 'Paiement non abouti' : 'Votre accès a expiré';
    const subtitle = isFirstPaymentFailed
        ? 'Un problème est survenu lors de votre paiement'
        : isPaimentFailed
        ? 'Un problème est survenu lors du renouvellement'
        : 'Renouvelez votre abonnement pour continuer';
    const bodyText = isFirstPaymentFailed
        ? `Bonjour${toName ? ' ' + toName : ''},<br><br>Nous n'avons pas pu confirmer votre paiement pour l'abonnement <strong style="color:#f0c75e;">Le Tore</strong> — votre moyen de paiement n'a pas été accepté.<br><br>Nous retentons automatiquement le prélèvement dans les prochains jours. Vous pouvez aussi mettre à jour votre moyen de paiement dès maintenant depuis votre espace membre.`
        : isPaimentFailed
        ? `Bonjour${toName ? ' ' + toName : ''},<br><br>Nous n'avons pas pu renouveler votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> — votre moyen de paiement n'a pas été accepté.<br><br>Pour continuer à accéder à vos tirages, veuillez mettre à jour votre paiement.`
        : `Bonjour${toName ? ' ' + toName : ''},<br><br>Votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> est arrivé à échéance et votre accès a été suspendu.<br><br>Renouvelez votre abonnement pour retrouver votre espace et continuer vos tirages.`;

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}.h1{font-size:26px!important}.btn{padding:13px 20px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;" bgcolor="#050a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.png">
<tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;">
<table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">
<tr><td style="padding:0;line-height:0;font-size:0;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;"></td></tr>
<tr><td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
<h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">${title}</h1>
<table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
<p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">${subtitle}</p>
</td></tr>
<tr><td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;text-align:justify;">${bodyText}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr><td style="border-radius:6px;" bgcolor="#d4af37">
<a href="https://oradia.fr/member/login.html?returnTo=abonnements.html%3FfromEmail%3D1" class="btn" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">Renouveler mon abonnement</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:0 24px 16px;" bgcolor="#0a1628">
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
<tr><td align="center" style="padding:36px 32px 28px;border-top:1px solid rgba(212,175,55,0.15);" bgcolor="#0a1628">
<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">Avec gratitude,</p>
<p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
<p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">Fondateur d'Oradia</p>
<p style="margin:0 0 12px;text-align:center;"><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4));vertical-align:middle;"></span><span style="display:inline-block;width:5px;height:5px;background:#d4af37;border-radius:50%;opacity:0.45;vertical-align:middle;margin:0 8px;"></span><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent);vertical-align:middle;"></span></p>
<a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.png" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.png" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sender: { email: senderEmail, name: "Rudy d'Oradia" },
            to: [{ email: toEmail, name: toName || undefined }],
            replyTo: { email: 'contact@oradia.fr', name: "Rudy d'Oradia" },
            subject,
            htmlContent: html,
            textContent: `${bodyText.replace(/<[^>]+>/g, '')} — Renouveler : https://oradia.fr/tore.html`
        })
    });
    return response.ok;
}

// Email de check-in J+7 : envoyé aux abonnés Tore qui n'ont fait aucun tirage depuis
// leur paiement — signe probable d'un problème d'accès. Partagé entre le cron
// quotidien (api/admin/index.js), le renvoi manuel depuis l'onglet Abonnements et le
// bouton de test de l'onglet Mails.
// tempPassword : uniquement si le compte a encore un mot de passe provisoire jamais
// changé (must_change_password toujours true) — dans ce cas on régénère un nouveau
// mot de passe provisoire (l'ancien n'est jamais stocké en clair) et on rappelle la
// procédure de connexion. Si le mot de passe a déjà été changé, c'est bon signe :
// on ne rappelle pas la procédure de connexion, seulement le message + le contact.
async function sendToreCheckinReminderEmail({ toEmail, toName, tempPassword }) {
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return false;

    const loginUrl = 'https://oradia.fr/member/login.html?returnTo=%2Ftore.html';
    const contactUrl = 'https://oradia.fr/contact.html';

    const accessSection = tempPassword ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.14),rgba(212,175,55,0.05));border:1px solid rgba(212,175,55,0.35);border-radius:14px;margin-bottom:28px;">
            <tr><td align="center" style="padding:26px 28px;">
              <p style="margin:0 0 14px;color:rgba(212,175,55,0.65);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">Votre mot de passe provisoire</p>
              <p style="margin:0;color:#f0c75e;font-family:'Courier New',monospace;font-size:24px;font-weight:700;letter-spacing:0.15em;padding:12px 22px;background:rgba(10,22,45,0.45);border:1px solid rgba(212,175,55,0.25);border-radius:10px;">${tempPassword}</p>
              <p style="margin:14px 0 0;color:#c8c0a8;font-family:Georgia,serif;font-size:12px;line-height:1.6;">Connectez-vous avec l'adresse <strong style="color:#e8d9a8;">${toEmail}</strong> et ce mot de passe (nous en avons généré un nouveau par sécurité). Il vous sera demandé de le remplacer dès votre connexion.</p>
            </td></tr>
          </table>` : '';
    const textAccess = tempPassword
        ? `\nAdresse de connexion : ${toEmail}\nVotre mot de passe provisoire : ${tempPassword}\n`
        : '';

    const bodyIntro = tempPassword
        ? `Oups — nous avons remarqué que vous n'avez pas encore fait de tirage depuis votre abonnement au Tore. Rencontrez-vous des difficultés pour accéder à votre espace membre ?`
        : `Oups — nous avons remarqué que vous n'avez pas encore fait de tirage depuis votre abonnement au Tore. Rencontrez-vous des difficultés ?`;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({
            sender:    { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
            to:        [{ email: toEmail, name: toName }],
            replyTo:   { email: 'contact@oradia.fr', name: 'Oradia' },
            subject:   "Rudy d'Oradia - Un souci pour accéder au Tore ?",
            htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}.h1{font-size:26px!important}.btn{padding:13px 20px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;" bgcolor="#050a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.png">
<tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center;">
<table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">
<tr><td style="padding:0;line-height:0;font-size:0;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;"></td></tr>
<tr><td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
<h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">Besoin d'aide ?</h1>
<table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
<p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">Vous n'avez pas encore fait de tirage</p>
</td></tr>
<tr><td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;text-align:justify;">${toName ? toName + ',' : 'Bonjour,'}<br><br>${bodyIntro}</p>

<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;text-align:justify;">Si c'est le cas, je vous invite à me contacter directement — je serai ravi de vous aider à en profiter pleinement.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
<tr><td style="border-radius:6px;" bgcolor="#d4af37">
<a href="${contactUrl}" class="btn" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">Me contacter</a>
</td></tr></table>

${accessSection}

<p style="margin:0;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;text-align:justify;">Et si tout va bien de votre côté, ignorez simplement ce message et continuez votre exploration quand vous le souhaitez.</p>
</td></tr>
<tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:36px 32px 28px;" bgcolor="#0a1628">
<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">Avec gratitude,</p>
<p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
<p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">Fondateur d'Oradia</p>
<a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.png" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.png" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`,
            textContent: `Besoin d'aide ?\n\n${bodyIntro}\n\nMe contacter : ${contactUrl}${textAccess}\n\nSe connecter : ${loginUrl}\n\nOradia — oradia.fr`
        })
    });
    return response.ok;
}

module.exports = { sendToreSubscriptionEmail, sendSubscriptionEmail, sendToreCheckinReminderEmail };
