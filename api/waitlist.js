const { createClient } = require('@supabase/supabase-js');

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

    const email = String(req.body?.email || '').trim().toLowerCase();

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

    return res.status(200).json({
      success: true,
      message: 'Tu es inscrit à la liste d\'attente.'
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
