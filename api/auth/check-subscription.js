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

  const email = req.query.email;
  if (!email) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed: false, error: 'Email requis' }));
  }

  try {
    const supabaseUrl = 'https://nxxetkdozynuytlbhxdx.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseKey) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false, error: 'Configuration manquante' }));
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('tore_subscriptions')
      .select('status, expires_at')
      .eq('email', email.toLowerCase())
      .eq('status', 'active')
      .single();

    if (error || !data) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ subscribed: false }));
    }

    const subscribed = !data.expires_at || new Date(data.expires_at) > new Date();

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed }));

  } catch (error) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed: false, error: 'Erreur serveur' }));
  }
};
