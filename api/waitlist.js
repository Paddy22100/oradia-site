const { createClient } = require('@supabase/supabase-js');
// Fonction loadLocalEnvIfNeeded fusionnée depuis lib
const fs = require('fs');
const path = require('path');

let hasLoaded = false;

function parseEnvContent(content) {
  const out = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n').trim();
    out[key] = value;
  }
  return out;
}

function loadLocalEnvIfNeeded() {
  if (hasLoaded) return;
  hasLoaded = true;
  const hasRequiredNow = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (hasRequiredNow) return;
  const root = process.cwd();
  const candidates = ['.env.local', '.env'];
  for (const fileName of candidates) {
    const filePath = path.join(root, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parseEnvContent(content);
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k] && typeof v === 'string' && v.length > 0) {
          process.env[k] = v;
        }
      }
    } catch (error) {
      console.error('Local env load failed:', error.message);
    }
  }
}

loadLocalEnvIfNeeded();

// ── Rate limiting en mémoire (newsletter uniquement) ──────────────────────
// Best-effort : par instance Vercel. Suffit à bloquer les scripts de masse.
// Fenêtre : 15 min, max 5 inscriptions newsletter par IP.
const _rlMap = new Map();
const RL_WINDOW_MS = 15 * 60 * 1000;
const RL_MAX       = 5;

function getClientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = _rlMap.get(ip);
  if (!entry || now - entry.start > RL_WINDOW_MS) {
    _rlMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (entry.count > RL_MAX) return true;
  return false;
}

function getSupabaseClient() {
  // URL Supabase du projet oradia-prod (nxzetkdozynyutlbhxdx)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error('SUPABASE_URL manquante dans les variables d\'environnement');
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante dans les variables d\'environnement');
  return createClient(supabaseUrl, supabaseKey);
}

function validateEnvironment() {
  const missing = [];

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  }

  if (missing.length > 0) {
    throw new Error(`Configuration error: Missing ${missing.join(', ')}`);
  }
}

function setCORS(req, res) {
  const allowedOrigins = [
    'https://oradia.fr',
    'https://www.oradia.fr',
    'https://oradia-site-trail.vercel.app',
    'https://oradia.vercel.app'
  ];

  const origin = req.headers?.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function getRequestBody(req) {
  if (!req || typeof req.body === 'undefined' || req.body === null) {
    return {};
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  if (typeof req.body === 'object') {
    return req.body;
  }

  return {};
}

async function addContactToBrevoList(email) {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_WAITLIST_LIST_ID;

  if (!apiKey || !listId) {
    console.warn('Brevo config missing for contact list addition');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        email,
        listIds: [parseInt(listId)],
        updateEnabled: true
      })
    });

    if (!response.ok && response.status !== 204) {
      const err = await response.json().catch(() => ({}));
      console.error('Brevo add contact error:', err);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Brevo add contact failed:', error.message);
    return false;
  }
}

async function sendWaitlistConfirmationEmail(email) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'ORADIA';

  if (!apiKey || !senderEmail) {
    console.warn('Brevo config missing for waitlist confirmation email');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        sender: {
          email: senderEmail,
          name: senderName
        },
        to: [{ email }],
        replyTo: {
          email: "contact@oradia.fr",
          name: "Oradia"
        },
        subject: 'Bienvenue dans l\'univers ORADIA ✨',
        htmlContent: `
<!DOCTYPE html>
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Bienvenue dans l'univers ORADIA</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width:620px) {
      .container { width:100% !important; }
      .pad { padding:24px 20px !important; }
      .pad-body { padding:0 20px 24px !important; }
      .h1 { font-size:28px !important; }
      .btn-preorder { padding:13px 20px !important; font-size:14px !important; }
      .btn-tirage td { display:block !important; text-align:center !important; padding:0 0 8px !important; }
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
              <h1 class="h1" style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:34px;font-weight:400;line-height:1.2;letter-spacing:2px;text-transform:uppercase;">
                Bienvenue
              </h1>
              <table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;">
                <tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
              </table>
              <p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;line-height:1.6;">
                Ton inscription est confirmée
              </p>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">

              <p style="margin:0 0 20px;color:#e8e9eb;font-family:Georgia,serif;font-size:15px;line-height:1.8;">
                Cher(e) ami(e),
              </p>
              <p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.9;">
                Merci de rejoindre la communauté ORADIA. Tu recevras nos inspirations, actualités de l'Oracle et avant-premières directement dans ta boîte mail.
              </p>

              <!-- Encart précommande -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;" bgcolor="#0f1d35">
                <tr>
                  <td style="padding:2px;border:1px solid #8a6d20;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f1d35">
                      <tr>
                        <td align="center" style="padding:22px 24px;">
                          <p style="margin:0 0 6px;color:#f0c75e;font-family:Georgia,serif;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">
                            Édition limitée
                          </p>
                          <p style="margin:0 0 18px;color:#e8e9eb;font-family:Georgia,serif;font-size:14px;line-height:1.7;">
                            L'Oracle physique ORADIA est en précommande.<br>Rejoins la première édition avant le 30 septembre 2026.
                          </p>
                          <a href="https://oradia.fr/precommande-oracle.html" class="btn-preorder" style="display:inline-block;background-color:#d4af37;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;text-decoration:none;padding:14px 32px;letter-spacing:0.5px;">
                            Précommander l'Oracle physique
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA tirage -->
              <p style="margin:0 0 14px;color:#9ca3af;font-family:Georgia,serif;font-size:13px;text-align:center;">
                Tu peux aussi faire un tirage en ligne dès maintenant avec La Boussole Intérieure.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
                <tr>
                  <td align="center">
                    <table class="btn-tirage" role="presentation" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #8a6d20;background-color:#0f1d35;">
                      <tr>
                        <td style="padding:11px 14px;vertical-align:middle;">
                          <img src="https://oradia.fr/images/logo-hd-v2.webp" width="28" height="28" alt="" style="display:block;border-radius:50%;">
                        </td>
                        <td style="padding:11px 18px 11px 4px;vertical-align:middle;">
                          <a href="https://oradia.fr/tore.html" style="color:#d4af37;font-family:Georgia,serif;font-size:14px;font-weight:bold;text-decoration:none;letter-spacing:0.5px;white-space:nowrap;">
                            Faire un tirage maintenant
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Séparateur -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr>
              </table>

              <p style="margin:0 0 6px;color:#d1d5db;font-family:Georgia,serif;font-size:13px;line-height:1.8;">
                Avec gratitude,
              </p>
              <p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:17px;font-weight:bold;letter-spacing:1px;">
                Rudy Boucheron
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 40px;" bgcolor="#040c1a">
              <p style="margin:0 0 8px;color:#9ca3af;font-family:Georgia,serif;font-size:12px;line-height:1.6;">
                <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:contact@oradia.fr" style="color:#d4af37;text-decoration:none;">contact@oradia.fr</a>
              </p>
              <p style="margin:0;color:#6b7280;font-family:Georgia,serif;font-size:11px;line-height:1.5;">
                ORADIA - La Boussole Intérieure<br>Révéler. Transmuter. Relier.
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->

      </td>
    </tr>
  </table>
</body>
</html>
        `,
        textContent: 'Bienvenue dans l\'univers ORADIA ! Ton inscription est confirmée. Tu recevras nos inspirations, actualités de l\'Oracle et avant-premières directement dans ta boîte mail. Tu peux dès maintenant faire un tirage en ligne : oradia.fr/tore.html — ou précommander l\'Oracle physique : oradia.fr/precommande-oracle.html — Avec gratitude, Rudy Boucheron'
      })
    });

    if (!response.ok) {
      console.error('Brevo waitlist email failed:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Brevo waitlist email error:', error.message);
    return false;
  }
}

async function sendSignupConfirmationEmail(email, name) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'ORADIA';

  if (!apiKey || !senderEmail) {
    console.warn('Brevo config missing for signup confirmation email');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email, name }],
        replyTo: { email: 'contact@oradia.fr', name: 'Oradia' },
        subject: 'Bienvenue dans votre espace ORADIA ✨',
        htmlContent: `<!DOCTYPE html>
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>@media only screen and (max-width:620px){.container{width:100%!important}.pad{padding:24px 20px!important}.pad-body{padding:0 20px 24px!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center top;" bgcolor="#050a14">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" background="https://oradia.fr/images/oradia-hero-4k.png" bgcolor="#050a14" style="background-color:#050a14;background-image:url('https://oradia.fr/images/oradia-hero-4k.png');background-size:cover;background-position:center top;">
    <tr>
      <td align="center" style="padding:32px 16px;background-color:rgba(5,10,20,0.72);" bgcolor="#050a14">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;" bgcolor="#0a1628">
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <img src="https://oradia.fr/images/medias/apercu_stripe.jpg" alt="ORADIA" width="600" height="220" style="display:block;width:100%;height:220px;object-fit:cover;border:0;">
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:32px 40px 20px;" bgcolor="#0a1628">
              <h1 style="margin:0;color:#f0c75e;font-family:Georgia,serif;font-size:30px;font-weight:400;letter-spacing:2px;text-transform:uppercase;">Votre espace est prêt</h1>
              <table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 14px;"><tr><td height="1" bgcolor="#d4af37" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
              <p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:14px;font-style:italic;">Bienvenue, ${name}</p>
            </td>
          </tr>
          <tr>
            <td class="pad-body" style="padding:0 40px 32px;" bgcolor="#0a1628">
              <p style="margin:0 0 24px;color:#d1d5db;font-family:Georgia,serif;font-size:14px;line-height:1.9;">
                Votre compte ORADIA a été créé avec succès. Vous pouvez dès maintenant accéder à votre espace membre et commencer vos tirages.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr><td align="center">
                  <a href="https://oradia.fr/member/login.html" style="display:inline-block;background-color:#d4af37;color:#0a1628;font-family:Georgia,serif;font-size:14px;font-weight:bold;text-decoration:none;padding:15px 32px;letter-spacing:0.5px;">Accéder à mon espace</a>
                </td></tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td height="1" bgcolor="#3a3010" style="line-height:1px;font-size:1px;">&nbsp;</td></tr></table>
              <p style="margin:0 0 6px;color:#d1d5db;font-family:Georgia,serif;font-size:13px;">Avec gratitude,</p>
              <p style="margin:0;color:#d8bf72;font-family:Georgia,serif;font-size:17px;font-weight:bold;letter-spacing:1px;">Rudy Boucheron</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px;" bgcolor="#040c1a">
              <p style="margin:0 0 6px;color:#9ca3af;font-family:Georgia,serif;font-size:11px;line-height:1.6;">
                <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a> &nbsp;&middot;&nbsp; <a href="mailto:contact@oradia.fr" style="color:#d4af37;text-decoration:none;">contact@oradia.fr</a>
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
</html>`,
        textContent: `Bienvenue ${name}, votre espace ORADIA est prêt. Connectez-vous sur oradia.fr/member/login.html` 
      })
    });

    if (!response.ok) {
      console.error('Brevo signup email failed:', response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Brevo signup email error:', error.message);
    return false;
  }
}

module.exports = async (req, res) => {
  try {
    setCORS(req, res);
    
    // Parser le body d'abord
    const body = getRequestBody(req);
    
    // ===== SIGNUP : création de compte Supabase =====
    if (body && body.action === 'signup') {
      try {
        const { email, password, name, birthdate, _hp } = body;

        // ── Honeypot : si le champ caché est rempli → bot silencieux ──
        if (_hp && String(_hp).trim().length > 0) {
          console.warn('[Signup] Honeypot déclenché — bot probable, IP:', getClientIp(req));
          // Répondre 200 pour ne pas trahir la détection
          return res.status(200).json({ success: true, user: { email, name }, message: 'Compte créé avec succès' });
        }

        console.log('[Signup] Body reçu:', JSON.stringify({
          hasEmail: !!email,
          hasPassword: !!password,
          hasName: !!name,
          email: email
        }));

        if (!email || !password || !name) {
          return res.status(400).json({
            success: false,
            error: 'Email, password et name sont requis'
          });
        }

        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        console.log('[Signup] Config:', JSON.stringify({
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseKey,
          urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 30) : 'MANQUANTE'
        }));

        if (!supabaseUrl || !supabaseKey) {
          return res.status(500).json({
            success: false,
            error: 'Configuration Supabase manquante'
          });
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log('[Signup] Appel Supabase pour:', email);

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          user_metadata: { full_name: name },
          email_confirm: false
        });

        console.log('[Signup] Résultat:', JSON.stringify({
          hasUser: !!authUser?.user,
          userId: authUser?.user?.id,
          errorMessage: authError?.message,
          errorStatus: authError?.status,
          errorCode: authError?.code
        }));

        if (authError) {
          return res.status(400).json({
            success: false,
            error: authError.message,
            code: authError.code
          });
        }

        // Créer l'entrée dans tore_subscriptions
        try {
          const { error: subError } = await supabase
            .from('tore_subscriptions')
            .insert({
              email: email,
              full_name: name,
              birthdate: birthdate || null,
              status: 'active', // Les comptes créés manuellement sont actifs par défaut
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          
          if (subError) {
            console.error('[Signup] tore_subscriptions insert error:', subError.message);
            // Ne pas bloquer la création du compte pour cette erreur
          } else {
            console.log('[Signup] tore_subscriptions entry created for:', email);
          }
        } catch (subError) {
          console.error('[Signup] tore_subscriptions exception:', subError.message);
        }

        try {
          await sendSignupConfirmationEmail(email, name);
        } catch (emailError) {
          console.log('[Signup] Email confirmation failed (non-bloquant):', emailError.message);
        }

        return res.status(200).json({
          success: true,
          user: { email, name },
          message: 'Compte créé avec succès'
        });

      } catch (signupError) {
        console.log('[Signup] Exception:', signupError.message);
        return res.status(500).json({
          success: false,
          error: signupError.message
        });
      }
    }
    
    // ===== WAITLIST : inscription newsletter (comportement existant) =====

    // ── Rate limiting newsletter ──
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      console.warn('[Waitlist] Rate limit atteint — IP:', ip);
      // Répondre 200 pour ne pas faciliter l'énumération des limites
      return res.status(200).json({ success: true, message: 'Vous êtes inscrit à la liste d\'attente.' });
    }

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        message: 'Méthode non autorisée'
      });
    }

    // body est déjà parsé plus haut
    const email = String(body.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email',
        message: 'Veuillez entrer une adresse email valide.'
      });
    }

    validateEnvironment();
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('newsletter_contacts')
      .upsert(
        {
          email,
          source: 'precommande-oracle',
          status: 'active',
          metadata: {
            page: 'precommande-oracle',
            subscribed_at: new Date().toISOString()
          }
        },
        { onConflict: 'email' }
      );

    if (error) {
      console.error('Waitlist upsert failed:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        message: 'Impossible de vous inscrire pour le moment.'
      });
    }

    const [emailSent, contactAdded] = await Promise.all([
      sendWaitlistConfirmationEmail(email),
      addContactToBrevoList(email)
    ]);

    // Marquer precommande_launch_sent_at pour éviter de renvoyer l'email de lancement
    // aux nouveaux abonnés (le mail de bienvenue contient déjà l'info précommande)
    supabase.from('newsletter_contacts')
      .update({ precommande_launch_sent_at: new Date().toISOString() })
      .eq('email', email)
      .is('precommande_launch_sent_at', null)
      .then(({ error }) => { if (error) console.warn('[Waitlist] precommande_launch_sent_at update failed:', error.message); });

    return res.status(200).json({
      success: true,
      message: 'Vous êtes inscrit à la liste d\'attente.',
      emailSent,
      contactAdded
    });
  } catch (error) {
    console.error('Waitlist endpoint failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Une erreur technique est survenue. Veuillez réessayer plus tard.'
    });
  }
};
