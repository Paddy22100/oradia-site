const { createClient } = require('@supabase/supabase-js');

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

module.exports = async (req, res) => {
  // Handle preflight
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });

    const { email, password } = body;

    if (!email || !password) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: false, 
        error: 'Email et mot de passe requis' 
      }));
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: false, 
        error: 'Configuration serveur manquante' 
      }));
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Sign in with email/password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.log('[Login] Échec:', email, authError.message);
      res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: false, 
        error: 'Email ou mot de passe incorrect' 
      }));
    }

    console.log('[Login] Succès:', email);
    
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      user: {
        email: authData.user.email,
        name: authData.user.user_metadata?.full_name || email.split('@')[0],
        id: authData.user.id
      },
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at
      }
    }));

  } catch (error) {
    console.error('[Login] Erreur:', error.message);
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      success: false, 
      error: 'Erreur serveur' 
    }));
  }
};
