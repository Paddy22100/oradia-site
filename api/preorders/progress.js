const { createClient } = require('@supabase/supabase-js');
const { loadLocalEnvIfNeeded } = require('../lib/load-local-env');

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

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

module.exports = async (req, res) => {
  try {
    setCORS(req, res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        message: 'Méthode non autorisée'
      });
    }

    validateEnvironment();
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('preorders')
      .select('id, items, paid_status')
      .eq('paid_status', 'completed');

    if (error) {
      console.error('Progress query failed:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        message: 'Impossible de récupérer la progression'
      });
    }

    let sold = 0;

    for (const row of data || []) {
      if (Array.isArray(row.items) && row.items.length > 0) {
        const qty = row.items.reduce((sum, item) => {
          const q = Number(item?.quantity);
          return sum + (Number.isFinite(q) && q > 0 ? q : 0);
        }, 0);

        sold += qty > 0 ? qty : 1;
      } else {
        sold += 1;
      }
    }

    const goal = Number(process.env.PREORDER_GOAL || 500);
    const remaining = Math.max(goal - sold, 0);
    const percent = goal > 0 ? Math.min(Math.round((sold / goal) * 100), 100) : 0;

    return res.status(200).json({
      success: true,
      sold,
      goal,
      remaining,
      percent
    });
  } catch (error) {
    console.error('Preorder progress failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Impossible de charger la progression'
    });
  }
};
