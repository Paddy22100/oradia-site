const { createClient } = require('@supabase/supabase-js');
const { loadLocalEnvIfNeeded } = require('./lib/load-local-env');

loadLocalEnvIfNeeded();

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#050a14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        
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
                Bienvenue
              </h1>
              <div style="width:60px;height:1px;background:linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);margin:20px auto;"></div>
              <p style="margin:0;color:#d8bf72;font-family:'Lora',Georgia,serif;font-size:15px;font-style:italic;line-height:1.6;letter-spacing:0.5px;">
                Ton inscription est confirmée
              </p>
            </td>
          </tr>

          <!-- Corps du message -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              
              <p style="margin:0 0 24px 0;color:#e8e9eb;font-family:'Lora',Georgia,serif;font-size:16px;line-height:1.8;">
                Cher(e) ami(e),
              </p>

              <p style="margin:0 0 28px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                Merci de rejoindre la communauté ORADIA. Tu seras informé(e) en priorité dès l'ouverture des tirages en ligne et des prochaines étapes de cette aventure.
              </p>

              <p style="margin:0 0 28px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:15px;line-height:1.9;">
                En attendant, tu peux déjà découvrir l'univers de l'Oracle et précommander ton exemplaire physique pour faire partie de la première édition.
              </p>

              <!-- CTA Précommander -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
                <tr>
                  <td align="center" style="padding:0;">
                    <a href="https://oradia.fr/precommande-oracle.html" style="display:inline-block;background:linear-gradient(135deg, #d4af37 0%, #f0c75e 100%);color:#0a1628;font-family:'Lora',Georgia,serif;font-size:15px;font-weight:600;text-decoration:none;padding:16px 32px;border-radius:4px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(212,175,55,0.3);">
                      Découvrir les offres de précommande
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Séparateur -->
              <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.3) 50%, transparent 100%);margin:40px 0 32px 0;"></div>

              <!-- Message de gratitude -->
              <p style="margin:0 0 8px 0;color:#d1d5db;font-family:'Lora',Georgia,serif;font-size:14px;line-height:1.8;">
                Avec gratitude,
              </p>
              <p style="margin:0;color:#d8bf72;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:600;letter-spacing:1px;">
                L'équipe ORADIA
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px;background:rgba(5,10,20,0.6);border-top:1px solid rgba(212,175,55,0.2);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 12px 0;color:#9ca3af;font-family:'Lora',Georgia,serif;font-size:12px;line-height:1.6;">
                      <a href="https://oradia.fr" style="color:#d4af37;text-decoration:none;">oradia.fr</a>
                      &nbsp;·&nbsp;
                      <a href="mailto:contact@oradia.fr" style="color:#d4af37;text-decoration:none;">contact@oradia.fr</a>
                    </p>
                    <p style="margin:0;color:#6b7280;font-family:'Lora',Georgia,serif;font-size:11px;line-height:1.5;">
                      ORADIA - La Boussole Intérieure<br>
                      Révéler. Transmuter. Relier.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
        `,
        textContent: 'Bienvenue dans l\'univers ORADIA ! Ton inscription à la liste d\'attente est confirmée. Tu seras informé(e) en priorité dès l\'ouverture des tirages en ligne. Découvre dès maintenant les offres de précommande sur oradia.fr/precommande-oracle.html - Avec gratitude, L\'équipe ORADIA'
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

module.exports = async (req, res) => {
  try {
    setCORS(req, res);

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

    const body = getRequestBody(req);
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
      .from('waitlist_tirages')
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

    const emailSent = await sendWaitlistConfirmationEmail(email);

    return res.status(200).json({
      success: true,
      message: 'Vous êtes inscrit à la liste d\'attente.',
      emailSent
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
