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
        subject: 'Votre inscription à la liste d\'attente ORADIA est confirmée',
        htmlContent: `
          <div style="font-family:Arial,sans-serif;background:#0a192f;color:#f5e7a1;padding:24px;">
            <div style="max-width:620px;margin:0 auto;border:1px solid rgba(212,175,55,0.4);border-radius:12px;padding:24px;background:#111d35;">
              <h1 style="margin:0 0 12px 0;color:#d4af37;font-size:28px;">ORADIA</h1>
              <p style="margin:0 0 16px 0;line-height:1.6;">Votre inscription à la liste d'attente est bien confirmée.</p>
              <p style="margin:0 0 16px 0;line-height:1.6;">Vous serez informé en priorité dès l'ouverture des tirages en ligne.</p>
              <p style="margin:0;line-height:1.6;">Avec gratitude,<br>L'équipe ORADIA</p>
            </div>
          </div>
        `,
        textContent: 'Votre inscription à la liste d\'attente ORADIA est confirmée. Vous serez informé en priorité dès l\'ouverture des tirages en ligne.'
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
      message: 'Tu es inscrit à la liste d\'attente.',
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
