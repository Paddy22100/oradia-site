// lib/tore-subscription-email.js
// Email de bienvenue / accès pour les abonnés Le Tore.
// Partagé entre api/stripe-webhook.js (activation automatique, y compris le filet
// de sécurité invoice.payment_succeeded) et api/admin/index.js (réparation manuelle
// d'un accès cassé depuis le dashboard admin).

// Bloc « précommande » + signature, communs aux emails abonnés (textes et visuel dans la
// langue de l'abonné). La page de précommande n'existe qu'en français : même lien.
function preorderTexts(en) {
    return en ? {
        img: 'https://oradia.fr/images/medias/banniere-facebook-en.webp',
        alt: 'Oradia Oracle — Pre-orders open', kicker: 'Pre-orders open', title: 'The Oradia Oracle',
        sub: '64 cards · Booklet · Initiatory tale · Handcrafted coin', btn: 'Pre-order',
        gratitude: 'With gratitude,', founder: 'Founder of Oradia'
    } : {
        img: 'https://oradia.fr/images/medias/banniere-facebook.webp',
        alt: 'Oracle Oradia — Précommandes ouvertes', kicker: 'Précommandes ouvertes', title: "L'Oracle Oradia",
        sub: '64 cartes · Livret · Conte initiatique · Pièce artisanale', btn: 'Précommander',
        gratitude: 'Avec gratitude,', founder: "Fondateur d'Oradia"
    };
}

// lang : 'en' pour un abonnement souscrit depuis le tirage anglais (/en/tore.html,
// transmis par les métadonnées Stripe), sinon français. Un seul template bilingue —
// jamais une copie par langue (voir CLAUDE.md, règle « un template email = une seule fonction »).
async function sendToreSubscriptionEmail({ toEmail, toName, tempPassword, resetLink, plan, lang }) {
    try {
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return false;
        const en = lang === 'en';
        const T = en ? {
            tempPwdTitle: 'Your temporary password',
            tempPwdBody: (e) => `Sign in with the address <strong style="color:#e8d9a8;">${e}</strong> and this password. You will be asked to replace it with a permanent password the first time you sign in.`,
            tempPwdText: (e, p) => `\nSign-in address: ${e}\nYour temporary password: ${p}\nYou will be asked to replace it the first time you sign in.\n`,
            resetTitle: 'Set your password', resetBtn: 'Choose my password',
            resetBody: (e) => `This link can only be used once. Once your password is set, sign in with the address <strong style="color:#e8d9a8;">${e}</strong>.`,
            resetText: (l, e) => `\nSet your password: ${l}\nThen sign in with the address: ${e}\n`,
            accessTitle: 'Your access',
            accessBody: (e) => `Sign in with the address <strong>${e}</strong> and your usual password`,
            accessText: (e) => `\nSign in with the address ${e} and your usual password.\n`,
            directLabel: 'Direct access:', directBody: ' click the button below to sign in to your member area and begin your exploration.',
            loginBtn: 'Sign in to my area',
            subject: "Rudy from Oradia - Welcome to the Tore — Your subscription is active",
            h1: 'Subscription activated', welcome: 'Welcome to the Tore', hello: 'Hello,',
            active: 'Your <strong style="color:#f0c75e;">Tore</strong> subscription is now active. You have unlimited access to the full Oradia experience.',
            renew: 'Your subscription renews automatically every month. You can manage it at any time from your member area (in French).',
            preorderAlt: 'Oradia Oracle — Pre-orders open', preorderKicker: 'Pre-orders open', preorderTitle: 'The Oradia Oracle',
            preorderSub: '64 cards · Booklet · Initiatory tale · Handcrafted coin', preorderBtn: 'Pre-order',
            gratitude: 'With gratitude,', founder: 'Founder of Oradia',
            textWelcome: 'Welcome to the Tore', textActive: 'Your subscription is now active.', textLogin: 'Sign in:',
            textRenew: 'Your subscription renews automatically every month.'
        } : {
            tempPwdTitle: 'Votre mot de passe provisoire',
            tempPwdBody: (e) => `Connectez-vous avec l'adresse <strong style="color:#e8d9a8;">${e}</strong> et ce mot de passe. Il vous sera demandé de le remplacer par un mot de passe définitif dès votre première connexion.`,
            tempPwdText: (e, p) => `\nAdresse de connexion : ${e}\nVotre mot de passe provisoire : ${p}\nIl vous sera demandé de le remplacer dès votre première connexion.\n`,
            resetTitle: 'Définir votre mot de passe', resetBtn: 'Choisir mon mot de passe',
            resetBody: (e) => `Ce lien est à usage unique. Une fois votre mot de passe défini, connectez-vous avec l'adresse <strong style="color:#e8d9a8;">${e}</strong>.`,
            resetText: (l, e) => `\nDéfinissez votre mot de passe : ${l}\nPuis connectez-vous avec l'adresse : ${e}\n`,
            accessTitle: 'Vos accès',
            accessBody: (e) => `Connectez-vous avec l'adresse <strong>${e}</strong> et votre mot de passe habituel`,
            accessText: (e) => `\nConnectez-vous avec l'adresse ${e} et votre mot de passe habituel.\n`,
            directLabel: 'Accès direct :', directBody: ' cliquez sur le bouton ci-dessous pour vous connecter à votre espace membre et commencer votre exploration.',
            loginBtn: 'Se connecter à mon espace',
            subject: "Rudy d'Oradia - Bienvenue dans Le Tore — Votre abonnement est actif",
            h1: 'Abonnement activé', welcome: 'Bienvenue dans Le Tore', hello: 'Bonjour,',
            active: 'Votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> est maintenant actif. Vous avez accès illimité à l\'expérience complète d\'Oradia.',
            renew: 'Votre abonnement se renouvelle automatiquement chaque mois. Vous pouvez le gérer à tout moment depuis votre espace membre.',
            preorderAlt: 'Oracle Oradia — Précommandes ouvertes', preorderKicker: 'Précommandes ouvertes', preorderTitle: "L'Oracle Oradia",
            preorderSub: '64 cartes · Livret · Conte initiatique · Pièce artisanale', preorderBtn: 'Précommander',
            gratitude: 'Avec gratitude,', founder: "Fondateur d'Oradia",
            textWelcome: 'Bienvenue dans Le Tore', textActive: 'Votre abonnement est maintenant actif.', textLogin: 'Se connecter :',
            textRenew: 'Votre abonnement se renouvelle automatiquement chaque mois.'
        };

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
              <p style="margin:0 0 14px;color:rgba(212,175,55,0.65);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">${T.tempPwdTitle}</p>
              <p style="margin:0;color:#f0c75e;font-family:'Courier New',monospace;font-size:24px;font-weight:700;letter-spacing:0.15em;padding:12px 22px;background:rgba(10,22,45,0.45);border:1px solid rgba(212,175,55,0.25);border-radius:10px;">${tempPassword}</p>
              <p style="margin:14px 0 0;color:#c8c0a8;font-family:Georgia,serif;font-size:12px;line-height:1.6;">${T.tempPwdBody(toEmail)}</p>
            </td></tr>
          </table>`;
            textAccess = T.tempPwdText(toEmail, tempPassword);
        } else if (resetLink) {
            accessSection = `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.14),rgba(212,175,55,0.05));border:1px solid rgba(212,175,55,0.35);border-radius:14px;margin-bottom:28px;">
            <tr><td align="center" style="padding:26px 28px;">
              <p style="margin:0 0 16px;color:rgba(212,175,55,0.65);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">${T.resetTitle}</p>
              <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;padding:14px 32px;border-radius:6px;">${T.resetBtn}</a>
              <p style="margin:16px 0 0;color:#c8c0a8;font-family:Georgia,serif;font-size:12px;line-height:1.6;">${T.resetBody(toEmail)}</p>
            </td></tr>
          </table>`;
            textAccess = T.resetText(resetLink, toEmail);
        } else {
            accessSection = `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.10),rgba(212,175,55,0.03));border:1px solid rgba(212,175,55,0.28);border-radius:14px;margin-bottom:28px;">
            <tr><td align="center" style="padding:24px 28px;">
              <p style="margin:0 0 10px;color:rgba(212,175,55,0.6);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">${T.accessTitle}</p>
              <p style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:15px;line-height:1.6;">
                ${T.accessBody(toEmail)}
              </p>
            </td></tr>
          </table>`;
            textAccess = T.accessText(toEmail);
        }

        // Espace membre en français uniquement ; après connexion, retour sur le tirage dans la langue de l'abonné.
        const loginUrl = 'https://oradia.fr/member/login.html?returnTo=' + (en ? '%2Fen%2Ftore.html' : '%2Ftore.html');

        // Le bouton "Accès direct" ne fait sens que si un mot de passe existe déjà pour ce
        // compte (cas tempPassword ou "mot de passe habituel"). En mode resetLink, le seul
        // CTA valable est "Choisir mon mot de passe" ci-dessus — un second bouton de connexion
        // serait un cul-de-sac pour quelqu'un qui n'a pas encore de mot de passe.
        const directAccessBlock = resetLink ? '' : `
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;text-align:justify;"><strong style="color:#f0c75e;">${T.directLabel}</strong>${T.directBody}</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr><td style="border-radius:6px;" bgcolor="#d4af37">
<a href="${loginUrl}" class="btn" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">${T.loginBtn}</a>
</td></tr></table>`;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
            body: JSON.stringify({
                sender:    { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
                to:        [{ email: toEmail, name: toName }],
                replyTo:   { email: 'contact@oradia.fr', name: 'Oradia' },
                subject:   T.subject,
                htmlContent: `<!DOCTYPE html><html lang="${en ? 'en' : 'fr'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}.h1{font-size:26px!important}.btn{padding:13px 20px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.webp');background-size:cover;background-position:center;" bgcolor="#050a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.webp">
<tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.webp');background-size:cover;background-position:center;">
<table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">
<tr><td style="padding:0;line-height:0;font-size:0;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;"></td></tr>
<tr><td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
<h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">${T.h1}</h1>
<table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
<p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">${T.welcome}</p>
</td></tr>
<tr><td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;text-align:justify;">${toName ? toName + ',' : T.hello}<br><br>${T.active}</p>

${accessSection}
${directAccessBlock}

<p style="margin:24px 0 0;color:rgba(212,175,55,0.6);font-family:Georgia,serif;font-size:13px;line-height:1.6;">${T.renew}</p>
</td></tr>
<tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:0 24px 16px;" bgcolor="#0a1628">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(212,175,55,0.35);border-radius:14px;">
    <tr><td style="padding:0;line-height:0;font-size:0;">
      <img src="${preorderTexts(en).img}" alt="${T.preorderAlt}" width="600" style="display:block;width:100%;height:auto;border:0;border-radius:14px 14px 0 0;">
    </td></tr>
    <tr><td style="background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06));padding:24px 32px;text-align:center;border-radius:0 0 14px 14px;">
      <p style="margin:0 0 6px;color:rgba(212,175,55,0.55);font-family:Georgia,serif;font-size:11px;letter-spacing:0.4em;text-transform:uppercase;">${T.preorderKicker}</p>
      <p style="margin:0 0 6px;color:#f0c75e;font-family:Georgia,serif;font-size:20px;font-weight:600;">${T.preorderTitle}</p>
      <p style="margin:0 0 16px;color:#c8c0a8;font-family:Georgia,serif;font-size:13px;line-height:1.6;">${T.preorderSub}</p>
      <a href="https://oradia.fr/precommande-oracle.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a192f;text-decoration:none;padding:12px 32px;border-radius:50px;font-weight:700;font-size:13px;letter-spacing:0.05em;font-family:Georgia,serif;">${T.preorderBtn}</a>
    </td></tr>
  </table>
</td></tr>
<tr><td align="center" style="padding:36px 32px 28px;border-top:1px solid rgba(212,175,55,0.15);" bgcolor="#0a1628">
<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">${T.gratitude}</p>
<p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
<p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">${T.founder}</p>
<p style="margin:0 0 12px;text-align:center;"><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4));vertical-align:middle;"></span><span style="display:inline-block;width:5px;height:5px;background:#d4af37;border-radius:50%;opacity:0.45;vertical-align:middle;margin:0 8px;"></span><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent);vertical-align:middle;"></span></p>
<a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.webp" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.webp" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://www.youtube.com/@oradiafr" target="_blank"><img src="https://oradia.fr/images/medias/icon-youtube.webp" alt="YouTube" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`,
                textContent: `${T.textWelcome}\n\n${T.textActive}${textAccess}${resetLink ? '' : `\n${T.textLogin} ${loginUrl}\n`}\n${T.textRenew}\n\nOradia — oradia.fr`
            })
        });
        return response.ok;
    } catch(e) { console.error('sendToreSubscriptionEmail error:', e.message); return false; }
}

// Email envoyé en cas d'échec de prélèvement ou d'annulation d'abonnement.
// Partagé entre api/stripe-webhook.js (envoi réel) et api/admin/index.js
// (bouton "Envoyer test" de l'onglet Mails du dashboard).
// lang : langue de l'abonné (tore_subscriptions.lang, 'en' | 'fr' par défaut).
async function sendSubscriptionEmail(toEmail, toName, type, lang) {
    const en = lang === 'en';
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
    const hello = en ? `Hello${toName ? ' ' + toName : ''},` : `Bonjour${toName ? ' ' + toName : ''},`;
    const T = en ? {
        subject: isFirstPaymentFailed
            ? "Rudy from Oradia - Your payment didn't go through — activate your access"
            : isPaimentFailed
            ? "Rudy from Oradia - Your payment didn't go through — renew your access"
            : "Rudy from Oradia - Your Tore subscription has ended",
        title: isPaimentFailed ? 'Payment unsuccessful' : 'Your access has expired',
        subtitle: isFirstPaymentFailed
            ? 'There was a problem with your payment'
            : isPaimentFailed
            ? 'There was a problem with your renewal'
            : 'Renew your subscription to continue',
        body: isFirstPaymentFailed
            ? `${hello}<br><br>We could not confirm your payment for the <strong style="color:#f0c75e;">Tore</strong> subscription — your payment method was declined.<br><br>We will automatically retry the payment in the coming days. You can also update your payment method right now from your member area (in French).`
            : isPaimentFailed
            ? `${hello}<br><br>We could not renew your <strong style="color:#f0c75e;">Tore</strong> subscription — your payment method was declined.<br><br>To keep access to your draws, please update your payment details.`
            : `${hello}<br><br>Your <strong style="color:#f0c75e;">Tore</strong> subscription has ended and your access has been suspended.<br><br>Renew your subscription to get your space back and continue your draws.`,
        cta: 'Renew my subscription',
        textRenew: 'Renew:', renewUrl: 'https://oradia.fr/en/tore.html'
    } : {
        subject: isFirstPaymentFailed
            ? "Rudy d'Oradia - Votre paiement n'a pas abouti — activer votre accès"
            : isPaimentFailed
            ? "Rudy d'Oradia - Votre paiement n'a pas abouti — renouveler votre accès"
            : "Rudy d'Oradia - Votre abonnement Le Tore est arrivé à échéance",
        title: isPaimentFailed ? 'Paiement non abouti' : 'Votre accès a expiré',
        subtitle: isFirstPaymentFailed
            ? 'Un problème est survenu lors de votre paiement'
            : isPaimentFailed
            ? 'Un problème est survenu lors du renouvellement'
            : 'Renouvelez votre abonnement pour continuer',
        body: isFirstPaymentFailed
            ? `${hello}<br><br>Nous n'avons pas pu confirmer votre paiement pour l'abonnement <strong style="color:#f0c75e;">Le Tore</strong> — votre moyen de paiement n'a pas été accepté.<br><br>Nous retentons automatiquement le prélèvement dans les prochains jours. Vous pouvez aussi mettre à jour votre moyen de paiement dès maintenant depuis votre espace membre.`
            : isPaimentFailed
            ? `${hello}<br><br>Nous n'avons pas pu renouveler votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> — votre moyen de paiement n'a pas été accepté.<br><br>Pour continuer à accéder à vos tirages, veuillez mettre à jour votre paiement.`
            : `${hello}<br><br>Votre abonnement <strong style="color:#f0c75e;">Le Tore</strong> est arrivé à échéance et votre accès a été suspendu.<br><br>Renouvelez votre abonnement pour retrouver votre espace et continuer vos tirages.`,
        cta: 'Renouveler mon abonnement',
        textRenew: '— Renouveler :', renewUrl: 'https://oradia.fr/tore.html'
    };
    const P = preorderTexts(en);
    const subject = T.subject;
    const title = T.title;
    const subtitle = T.subtitle;
    const bodyText = T.body;

    const html = `<!DOCTYPE html><html lang="${en ? 'en' : 'fr'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}.h1{font-size:26px!important}.btn{padding:13px 20px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.webp');background-size:cover;background-position:center;" bgcolor="#050a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.webp">
<tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.webp');background-size:cover;background-position:center;">
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
<a href="https://oradia.fr/member/login.html?returnTo=abonnements.html%3FfromEmail%3D1" class="btn" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">${T.cta}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:0 24px 16px;" bgcolor="#0a1628">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(212,175,55,0.35);border-radius:14px;">
    <tr><td style="padding:0;line-height:0;font-size:0;">
      <img src="${P.img}" alt="${P.alt}" width="600" style="display:block;width:100%;height:auto;border:0;border-radius:14px 14px 0 0;">
    </td></tr>
    <tr><td style="background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06));padding:24px 32px;text-align:center;border-radius:0 0 14px 14px;">
      <p style="margin:0 0 6px;color:rgba(212,175,55,0.55);font-family:Georgia,serif;font-size:11px;letter-spacing:0.4em;text-transform:uppercase;">${P.kicker}</p>
      <p style="margin:0 0 6px;color:#f0c75e;font-family:Georgia,serif;font-size:20px;font-weight:600;">${P.title}</p>
      <p style="margin:0 0 16px;color:#c8c0a8;font-family:Georgia,serif;font-size:13px;line-height:1.6;">${P.sub}</p>
      <a href="https://oradia.fr/precommande-oracle.html" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f5e7a1);color:#0a192f;text-decoration:none;padding:12px 32px;border-radius:50px;font-weight:700;font-size:13px;letter-spacing:0.05em;font-family:Georgia,serif;">${P.btn}</a>
    </td></tr>
  </table>
</td></tr>
<tr><td align="center" style="padding:36px 32px 28px;border-top:1px solid rgba(212,175,55,0.15);" bgcolor="#0a1628">
<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">${P.gratitude}</p>
<p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
<p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">${P.founder}</p>
<p style="margin:0 0 12px;text-align:center;"><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4));vertical-align:middle;"></span><span style="display:inline-block;width:5px;height:5px;background:#d4af37;border-radius:50%;opacity:0.45;vertical-align:middle;margin:0 8px;"></span><span style="display:inline-block;width:32px;height:1px;background:linear-gradient(90deg,rgba(212,175,55,0.4),transparent);vertical-align:middle;"></span></p>
<a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.webp" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.webp" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://www.youtube.com/@oradiafr" target="_blank"><img src="https://oradia.fr/images/medias/icon-youtube.webp" alt="YouTube" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
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
            textContent: `${bodyText.replace(/<[^>]+>/g, '')} ${T.textRenew} ${T.renewUrl}`
        })
    });
    // fetch ne lève pas d'exception sur une erreur HTTP Brevo (clé invalide, domaine non
    // vérifié, destinataire blacklisté…) : on la journalise ici pour qu'un échec d'envoi
    // ne passe jamais inaperçu (repris de l'ancienne copie de api/stripe-webhook.js).
    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error(`[sendSubscriptionEmail] Brevo ${response.status}: ${errText}`);
    }
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
// lang : langue de l'abonné (tore_subscriptions.lang, 'en' | 'fr' par défaut).
async function sendToreCheckinReminderEmail({ toEmail, toName, tempPassword, lang }) {
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return false;
    const en = lang === 'en';
    const P = preorderTexts(en);
    const T = en ? {
        pwdTitle: 'Your temporary password',
        pwdBody: `Sign in with the address <strong style="color:#e8d9a8;">${toEmail}</strong> and this password (we generated a new one for security). You will be asked to replace it when you sign in.`,
        pwdText: `\nSign-in address: ${toEmail}\nYour temporary password: ${tempPassword}\n`,
        introPwd: `Oops — we noticed you haven't made a draw yet since subscribing to the Tore. Are you having trouble accessing your member area?`,
        intro: `Oops — we noticed you haven't made a draw yet since subscribing to the Tore. Are you having any difficulties?`,
        subject: "Rudy from Oradia - Trouble accessing the Tore?",
        h1: 'Need help?', sub: "You haven't made a draw yet", hello: 'Hello,',
        invite: "If so, feel free to contact me directly — I'll be happy to help you make the most of it.",
        contactBtn: 'Contact me',
        allGood: "And if everything is fine on your side, simply ignore this message and continue your exploration whenever you like.",
        textContact: 'Contact me:', textLogin: 'Sign in:'
    } : {
        pwdTitle: 'Votre mot de passe provisoire',
        pwdBody: `Connectez-vous avec l'adresse <strong style="color:#e8d9a8;">${toEmail}</strong> et ce mot de passe (nous en avons généré un nouveau par sécurité). Il vous sera demandé de le remplacer dès votre connexion.`,
        pwdText: `\nAdresse de connexion : ${toEmail}\nVotre mot de passe provisoire : ${tempPassword}\n`,
        introPwd: `Oups — nous avons remarqué que vous n'avez pas encore fait de tirage depuis votre abonnement au Tore. Rencontrez-vous des difficultés pour accéder à votre espace membre ?`,
        intro: `Oups — nous avons remarqué que vous n'avez pas encore fait de tirage depuis votre abonnement au Tore. Rencontrez-vous des difficultés ?`,
        subject: "Rudy d'Oradia - Un souci pour accéder au Tore ?",
        h1: "Besoin d'aide ?", sub: "Vous n'avez pas encore fait de tirage", hello: 'Bonjour,',
        invite: "Si c'est le cas, je vous invite à me contacter directement — je serai ravi de vous aider à en profiter pleinement.",
        contactBtn: 'Me contacter',
        allGood: "Et si tout va bien de votre côté, ignorez simplement ce message et continuez votre exploration quand vous le souhaitez.",
        textContact: 'Me contacter :', textLogin: 'Se connecter :'
    };

    const loginUrl = 'https://oradia.fr/member/login.html?returnTo=' + (en ? '%2Fen%2Ftore.html' : '%2Ftore.html');
    const contactUrl = en ? 'https://oradia.fr/en/contact.html' : 'https://oradia.fr/contact.html';

    const accessSection = tempPassword ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.14),rgba(212,175,55,0.05));border:1px solid rgba(212,175,55,0.35);border-radius:14px;margin-bottom:28px;">
            <tr><td align="center" style="padding:26px 28px;">
              <p style="margin:0 0 14px;color:rgba(212,175,55,0.65);font-family:Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;">${T.pwdTitle}</p>
              <p style="margin:0;color:#f0c75e;font-family:'Courier New',monospace;font-size:24px;font-weight:700;letter-spacing:0.15em;padding:12px 22px;background:rgba(10,22,45,0.45);border:1px solid rgba(212,175,55,0.25);border-radius:10px;">${tempPassword}</p>
              <p style="margin:14px 0 0;color:#c8c0a8;font-family:Georgia,serif;font-size:12px;line-height:1.6;">${T.pwdBody}</p>
            </td></tr>
          </table>` : '';
    const textAccess = tempPassword
        ? T.pwdText
        : '';

    const bodyIntro = tempPassword ? T.introPwd : T.intro;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({
            sender:    { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
            to:        [{ email: toEmail, name: toName }],
            replyTo:   { email: 'contact@oradia.fr', name: 'Oradia' },
            subject:   T.subject,
            htmlContent: `<!DOCTYPE html><html lang="${en ? 'en' : 'fr'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}.h1{font-size:26px!important}.btn{padding:13px 20px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.webp');background-size:cover;background-position:center;" bgcolor="#050a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.webp">
<tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.webp');background-size:cover;background-position:center;">
<table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">
<tr><td style="padding:0;line-height:0;font-size:0;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;"></td></tr>
<tr><td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
<h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">${T.h1}</h1>
<table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
<p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">${T.sub}</p>
</td></tr>
<tr><td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;text-align:justify;">${toName ? toName + ',' : T.hello}<br><br>${bodyIntro}</p>

<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;text-align:justify;">${T.invite}</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
<tr><td style="border-radius:6px;" bgcolor="#d4af37">
<a href="${contactUrl}" class="btn" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">${T.contactBtn}</a>
</td></tr></table>

${accessSection}

<p style="margin:0;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;text-align:justify;">${T.allGood}</p>
</td></tr>
<tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:36px 32px 28px;" bgcolor="#0a1628">
<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">${P.gratitude}</p>
<p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
<p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">${P.founder}</p>
<a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.webp" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.webp" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://www.youtube.com/@oradiafr" target="_blank"><img src="https://oradia.fr/images/medias/icon-youtube.webp" alt="YouTube" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`,
            textContent: `${T.h1}\n\n${bodyIntro}\n\n${T.textContact} ${contactUrl}${textAccess}\n\n${T.textLogin} ${loginUrl}\n\nOradia — oradia.fr`
        })
    });
    return response.ok;
}

// Invitation à activer un abonnement Tore offert (dashboard admin > Abonnements > Offrir
// un mois), sans carte bancaire : la ligne tore_subscriptions est déjà créée (active,
// is_free, expires_at = date du jour + N mois) au moment de l'envoi — ce mail invite
// simplement le destinataire à créer son mot de passe sur /inscription pour en profiter,
// avec un QR code (logo Oradia incrusté) en plus du bouton, comme demandé.
async function buildGiftQrDataUri(claimUrl) {
    const QRCode = require('qrcode');
    const sharp = require('sharp');
    const qrBuffer = await QRCode.toBuffer(claimUrl, {
        errorCorrectionLevel: 'H', width: 360, margin: 2,
        color: { dark: '#0a192f', light: '#ffffff' }
    });
    try {
        const logoRes = await fetch('https://oradia.fr/images/logo-160.webp');
        const logoBuffer = Buffer.from(await logoRes.arrayBuffer());
        const logoSize = 84;
        const logo = await sharp(logoBuffer).resize(logoSize, logoSize).toBuffer();
        const ring = logoSize + 12;
        // Halo blanc : sépare le médaillon du bruit du QR (sans lui, le logo se noie dans
        // les modules voisins et ressemble à une tache plutôt qu'à un médaillon dessiné).
        const halo = ring + 26;
        const backing = Buffer.from(
            `<svg width="${halo}" height="${halo}">
               <circle cx="${halo / 2}" cy="${halo / 2}" r="${halo / 2 - 1}" fill="#ffffff"/>
               <circle cx="${halo / 2}" cy="${halo / 2}" r="${ring / 2}" fill="#0a192f" stroke="#d4af37" stroke-width="2"/>
             </svg>`
        );
        const composed = await sharp(qrBuffer)
            .composite([{ input: backing, gravity: 'center' }, { input: logo, gravity: 'center' }])
            .png()
            .toBuffer();
        return `data:image/png;base64,${composed.toString('base64')}`;
    } catch (e) {
        // Logo indisponible (réseau, etc.) : le QR reste utilisable sans lui plutôt que
        // de faire échouer tout l'envoi pour un simple habillage visuel.
        return `data:image/png;base64,${qrBuffer.toString('base64')}`;
    }
}

async function sendOracleGiftInviteEmail({ toEmail, toName, months, claimUrl }) {
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return false;

    const monthsLabel = months > 1 ? `${months} mois offerts` : '1 mois offert';
    const qrDataUri = await buildGiftQrDataUri(claimUrl).catch(() => null);
    const qrSection = qrDataUri ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td align="center">
              <img src="${qrDataUri}" alt="QR code d'activation" width="180" height="180" style="display:block;width:180px;height:180px;border-radius:12px;">
              <p style="margin:10px 0 0;color:rgba(212,175,55,0.5);font-family:Georgia,serif;font-size:11px;font-style:italic;">Scannez avec votre téléphone, ou utilisez le bouton ci-dessous.</p>
            </td></tr>
          </table>` : '';

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({
            sender:    { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ORADIA' },
            to:        [{ email: toEmail, name: toName }],
            replyTo:   { email: 'contact@oradia.fr', name: 'Oradia' },
            subject:   `Rudy d'Oradia - ${monthsLabel} sur l'abonnement Tore`,
            htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}.h1{font-size:26px!important}.btn{padding:13px 20px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.webp');background-size:cover;background-position:center;" bgcolor="#050a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050a14" background="https://oradia.fr/images/oradia-hero-4k.webp">
<tr><td align="center" style="padding:32px 16px;background-image:url('https://oradia.fr/images/oradia-hero-4k.webp');background-size:cover;background-position:center;">
<table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">
<tr><td style="padding:0;line-height:0;font-size:0;"><img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="Oracle ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;"></td></tr>
<tr><td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
<h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">${monthsLabel}</h1>
<table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
<p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">Sur l'abonnement Tore — tirages illimités</p>
</td></tr>
<tr><td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
<p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:15px;line-height:1.8;text-align:justify;">${toName ? toName + ',' : 'Bonjour,'}<br><br>Je vous offre ${monthsLabel.toLowerCase()} sur l'abonnement Tore : tirages illimités, interprétation de chaque tirage, et votre historique conservé dans votre espace personnel.</p>

${qrSection}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
<tr><td style="border-radius:6px;" bgcolor="#d4af37">
<a href="${claimUrl}" class="btn" style="display:inline-block;padding:15px 32px;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border-radius:6px;">Activer mon accès</a>
</td></tr></table>

<p style="margin:0;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.8;text-align:justify;">Il vous suffit de créer votre mot de passe — aucune carte bancaire n'est demandée. Votre accès reste actif pendant ${months > 1 ? `les ${months} prochains mois` : 'le mois à venir'}, sans reconduction automatique.</p>
</td></tr>
<tr><td style="padding:0 40px;" bgcolor="#0a1628"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:36px 32px 28px;" bgcolor="#0a1628">
<p style="margin:0 0 6px;color:#c8c0a8;font-size:13px;font-style:italic;opacity:0.7;font-family:Georgia,serif;">Avec gratitude,</p>
<p style="margin:0 0 4px;color:#d4af37;font-size:52px;font-family:'Dancing Script','Brush Script MT','Apple Chancery',cursive;font-weight:700;line-height:1.1;letter-spacing:0.01em;">Rudy</p>
<p style="margin:0 0 16px;color:#c8c0a8;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;font-family:Georgia,serif;">Fondateur d'Oradia</p>
<a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:Georgia,serif;">oradia.fr</a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;"><tr><td style="padding:0 7px;"><a href="https://www.facebook.com/profile.php?id=61591590952794" target="_blank"><img src="https://oradia.fr/images/medias/icon-facebook.webp" alt="Facebook" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://instagram.com/oradia_oracle_officiel" target="_blank"><img src="https://oradia.fr/images/medias/icon-instagram.webp" alt="Instagram" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td><td style="padding:0 7px;"><a href="https://www.youtube.com/@oradiafr" target="_blank"><img src="https://oradia.fr/images/medias/icon-youtube.webp" alt="YouTube" width="34" height="34" style="display:block;width:34px;height:34px;border:0;"></a></td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`,
            textContent: `${monthsLabel} sur l'abonnement Tore\n\n${toName ? toName + ',' : 'Bonjour,'} je vous offre ${monthsLabel.toLowerCase()} sur l'abonnement Tore.\n\nActiver mon accès : ${claimUrl}\n\nAucune carte bancaire n'est demandée.\n\nOradia — oradia.fr`
        })
    });
    return response.ok;
}

module.exports = { sendToreSubscriptionEmail, sendSubscriptionEmail, sendToreCheckinReminderEmail, sendOracleGiftInviteEmail };
