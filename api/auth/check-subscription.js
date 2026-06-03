const { createClient } = require('@supabase/supabase-js');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    return res.end();
  }

  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed: false, error: 'Email requis' }));
  }

  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed: false, error: 'SUPABASE_SERVICE_ROLE_KEY absent' }));
  }

  try {
    const supabase = createClient(
      'https://nxxetkdozynuytlbhxdx.supabase.co',
      supabaseKey
    );

    const { data, error } = await supabase
      .from('tore_subscriptions')
      .select('status, expires_at')
      .eq('email', email)
      .eq('status', 'active')
      .limit(1);

    if (error) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false, debug_error: error.message }));
    }

    const rows = data || [];
    if (rows.length === 0) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false, debug_info: 'no_row_found', queried_email: email }));
    }

    const row = rows[0];
    const subscribed = !row.expires_at || new Date(row.expires_at) > new Date();

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed, expires_at: row.expires_at }));

  } catch (err) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed: false, error: 'Erreur serveur', debug_catch: err?.message }));
  }
};
