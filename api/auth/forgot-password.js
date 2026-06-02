const { createClient } = require('@supabase/supabase-js');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
  }

  try {
    const body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
      req.on('error', reject);
    });

    const { email } = body;

    if (!email) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Email requis' }));
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Configuration serveur manquante' }));
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://oradia.fr/member/reset-password.html'
    });

    if (error) {
      console.error('[ForgotPassword] Erreur:', error.message);
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: error.message }));
    }

    console.log('[ForgotPassword] Lien envoyé à:', email);
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true }));

  } catch (error) {
    console.error('[ForgotPassword] Erreur:', error.message);
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Erreur serveur' }));
  }
};
