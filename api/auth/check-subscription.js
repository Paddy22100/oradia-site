const { createClient } = require('@supabase/supabase-js');

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

  // Test réseau direct avant d'utiliser le client Supabase
  try {
    const pingUrl = `${SUPABASE_URL}/rest/v1/tore_subscriptions?email=eq.${encodeURIComponent(email)}&status=eq.active&select=status,expires_at&limit=1`;
    const pingResp = await fetch(pingUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json'
      }
    });
    const pingStatus = pingResp.status;
    const pingBody = await pingResp.text();

    if (!pingResp.ok) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false, debug_http_status: pingStatus, debug_body: pingBody.slice(0, 300) }));
    }

    const rows = JSON.parse(pingBody);
    if (!Array.isArray(rows) || rows.length === 0) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false, debug_info: 'no_row_found', queried_email: email }));
    }

    const row = rows[0];
    const subscribed = !row.expires_at || new Date(row.expires_at) > new Date();
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed, expires_at: row.expires_at }));

  } catch (err) {
    // fetch natif a échoué — essai avec le client Supabase
    try {
      const supabase = createClient(SUPABASE_URL, supabaseKey);
      const { data, error } = await supabase
        .from('tore_subscriptions')
        .select('status, expires_at')
        .eq('email', email)
        .eq('status', 'active')
        .limit(1);

      if (error) {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ subscribed: false, debug_error: error.message, debug_fetch_err: err?.message }));
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

    } catch (err2) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        subscribed: false,
        error: 'double_fetch_failed',
        err1: err?.message,
        err2: err2?.message,
        key_present: !!supabaseKey,
        key_start: supabaseKey ? supabaseKey.slice(0, 10) : 'N/A'
      }));
    }
  }
};
