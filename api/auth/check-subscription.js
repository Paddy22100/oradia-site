const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nxzetkdozynuytlbhxdx.supabase.co';

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
    const url = `${SUPABASE_URL}/rest/v1/tore_subscriptions?email=eq.${encodeURIComponent(email)}&status=eq.active&select=status,expires_at&limit=1`;
    const resp = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      const body = await resp.text();
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false, debug_http_status: resp.status, debug_body: body.slice(0, 200) }));
    }

    const rows = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false }));
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
