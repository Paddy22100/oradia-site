const https = require('https');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function supabaseGet(path, key) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'nxxetkdozynuytlbhxdx.supabase.co',
      path: '/rest/v1/' + path,
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, (r) => {
      let body = '';
      r.on('data', chunk => body += chunk);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(body) }); }
        catch(e) { resolve({ status: r.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

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
    return res.end(JSON.stringify({ subscribed: false, error: 'Configuration manquante' }));
  }

  try {
    const encodedEmail = encodeURIComponent(email);
    const path = `tore_subscriptions?email=eq.${encodedEmail}&status=eq.active&select=status,expires_at&limit=1`;
    const result = await supabaseGet(path, supabaseKey);

    if (result.status !== 200) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false, debug_status: result.status, debug_data: result.data }));
    }

    const rows = Array.isArray(result.data) ? result.data : [];
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
