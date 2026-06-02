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

    // Sign in with email/password (autorise les emails non confirmés)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      // Si l'erreur est "Email not confirmed", on essaie avec l'admin API pour contourner
      if (authError.message && authError.message.includes('Email not confirmed')) {
        console.log('[Login] Email non confirmé, tentative contournement admin pour:', email);
        
        // Récupérer tous les utilisateurs et filtrer par email manuellement
        const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
        
        if (userError || !userData.users) {
          console.log('[Login] Erreur listUsers:', userError?.message);
          res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ 
            success: false, 
            error: 'Email ou mot de passe incorrect' 
          }));
        }
        
        const user = userData.users.find(u => u.email === email);
        
        if (!user) {
          console.log('[Login] Utilisateur non trouvé:', email);
          res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ 
            success: false, 
            error: 'Email ou mot de passe incorrect' 
          }));
        }
        
        // Vérifier le mot de passe avec signInWithPassword sur l'anon key
        // mais on doit accepter l'email non confirmé
        // Solution: créer une session manuellement ou forcer la confirmation
        
        // Forcer la confirmation de l'email via admin
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          user.id,
          { email_confirm: true }
        );
        
        if (updateError) {
          console.log('[Login] Erreur confirmation email:', updateError.message);
        } else {
          console.log('[Login] Email confirmé automatiquement pour:', email);
        }
        
        // Réessayer le login maintenant que l'email est confirmé
        const { data: authData2, error: authError2 } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (authError2) {
          console.log('[Login] Échec après confirmation:', email, authError2.message);
          res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ 
            success: false, 
            error: 'Email ou mot de passe incorrect' 
          }));
        }
        
        console.log('[Login] Succès après confirmation auto:', email);

        let subscribed2 = false;
        try {
          const { data: subData2 } = await supabase
            .from('tore_subscriptions')
            .select('status, expires_at')
            .eq('email', email)
            .eq('status', 'active')
            .single();
          if (subData2) {
            if (!subData2.expires_at || new Date(subData2.expires_at) > new Date()) {
              subscribed2 = true;
            }
          }
        } catch (e) {}

        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          user: {
            email: authData2.user.email,
            name: authData2.user.user_metadata?.full_name || email.split('@')[0],
            id: authData2.user.id,
            subscribed: subscribed2
          },
          session: {
            access_token: authData2.session.access_token,
            refresh_token: authData2.session.refresh_token,
            expires_at: authData2.session.expires_at
          }
        }));
      }
      
      console.log('[Login] Échec:', email, authError.message);
      res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        success: false, 
        error: 'Email ou mot de passe incorrect' 
      }));
    }

    console.log('[Login] Succès:', email);

    // Vérifier si abonnement actif dans tore_subscriptions
    let subscribed = false;
    try {
      const { data: subData } = await supabase
        .from('tore_subscriptions')
        .select('status, expires_at')
        .eq('email', email)
        .eq('status', 'active')
        .single();
      if (subData) {
        if (!subData.expires_at || new Date(subData.expires_at) > new Date()) {
          subscribed = true;
        }
      }
    } catch (e) {}

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      user: {
        email: authData.user.email,
        name: authData.user.user_metadata?.full_name || email.split('@')[0],
        id: authData.user.id,
        subscribed
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
