const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  // URL Supabase du projet oradia-prod (nxzetkdozynyutlbhxdx)
  const supabaseUrl = process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, supabaseKey);
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

    // Si pas de config Supabase, retourner des valeurs par défaut
    const hasSupabaseConfig = process.env.SUPABASE_SERVICE_ROLE_KEY && 
                              (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    
    let sold = 0;
    
    if (hasSupabaseConfig) {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('preorders')
          .select('id, items, paid_status, stripe_session_id')
          .eq('paid_status', 'completed')
          .not('stripe_session_id', 'like', 'cs_test_%');

        if (error) {
          console.error('Progress query failed:', error.message);
        } else {
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
        }
      } catch (dbError) {
        console.error('Database error:', dbError.message);
      }
    } else {
      console.warn('Supabase not configured - returning default values');
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
