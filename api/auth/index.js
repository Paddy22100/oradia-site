const { createClient } = require('@supabase/supabase-js');

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Simple in-memory rate limiter
const rateLimitStore = new Map();

function checkRateLimit(ip, limit = 5, windowMs = 60000) { // 5 requests per minute
  const now = Date.now();
  const key = `login:${ip}`;
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const record = rateLimitStore.get(key);
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

// ============ LOGIN ============
async function handleLogin(req, res) {
  // Rate limiting check
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIP, 5, 60000)) { // 5 attempts per minute
    res.writeHead(429, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      success: false, 
      error: 'Trop de tentatives de connexion. Veuillez réessayer dans une minute.' 
    }));
  }
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

  // Vérifier si l'utilisateur a un facteur MFA TOTP actif
  let mfaRequired = false;
  let mfaFactorId = null;
  try {
    const { data: factorsData } = await supabase.auth.admin.mfa.listFactors({ userId: authData.user.id });
    const verifiedFactor = factorsData?.totp?.find(f => f.status === 'verified');
    if (verifiedFactor) {
      mfaRequired = true;
      mfaFactorId = verifiedFactor.id;
    }
  } catch(e) {}

  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({
    success: true,
    mfa_required: mfaRequired,
    mfa_factor_id: mfaFactorId,
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
}

// ============ CHECK SUBSCRIPTION ============
async function handleCheckSubscription(req, res) {
  const email = (req.query?.email || '').toLowerCase().trim();
  if (!email) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed: false, error: 'Email requis' }));
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed: false, error: 'Configuration serveur manquante' }));
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: subData } = await supabase
      .from('tore_subscriptions')
      .select('status, expires_at, created_at, birth_date, birth_place')
      .eq('email', email)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let subscribed = false;
    if (subData) {
      subscribed = !subData.expires_at || new Date(subData.expires_at) > new Date();
    }

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      subscribed,
      expires_at: subData?.expires_at,
      subscription_start: subData?.created_at,
      birth_date: subData?.birth_date || null,
      birth_place: subData?.birth_place || null
    }));

  } catch (err) {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ subscribed: false }));
  }
}

// ============ REFRESH SESSION ============
// Renouvelle un access_token expiré à partir du refresh_token (Supabase Auth).
// Permet aux membres connectés de longue date (session > 1h) de continuer à
// enregistrer leurs tirages dans l'historique sans se reconnecter.
async function handleRefreshSession(req, res) {
  const body = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });

  const { refresh_token } = body;
  if (!refresh_token) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'refresh_token requis' }));
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Configuration serveur manquante' }));
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.refreshSession({ refresh_token });

  if (error || !data?.session) {
    res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Session expirée, reconnexion requise' }));
  }

  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({
    success: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at
    }
  }));
}

// ============ CONSUME TORE DRAW ============
async function handleConsumeToreDraw(req, res) {
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
    return res.end(JSON.stringify({ error: 'Email required' }));
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Configuration serveur manquante' }));
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: sub } = await supabase
      .from('tore_subscriptions')
      .select('id, status, expires_at')
      .eq('email', email)
      .single();

    if (!sub) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Abonné actif : ne pas toucher aux crédits
    if (sub.status === 'active' && new Date(sub.expires_at) > new Date()) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('[consume-tore-draw]', err);
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true })); // silencieux
  }
}

// ============ CHECK TORE DRAW (limite journalière Découverte) ============
async function handleCheckToreDraw(req, res) {
  const body = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on('error', reject);
  });

  const { email } = body;
  if (!email) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ allowed: false, error: 'Email requis' }));
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sub } = await supabase
    .from('tore_subscriptions')
    .select('id, status, expires_at, plan, daily_draw_count, last_draw_date')
    .eq('email', email)
    .eq('status', 'active')
    .maybeSingle();

  // Pas d'abonnement actif ou expiré → laisser passer (freemium localStorage gère côté client)
  if (!sub || (sub.expires_at && new Date(sub.expires_at) <= new Date())) {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ allowed: true, plan: null }));
  }

  const plan = sub.plan || 'complet';

  // Plan complet : aucune limite
  if (plan !== 'decouverte') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ allowed: true, plan }));
  }

  // Plan Découverte : 1 tirage par jour
  const today   = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const sameDay = sub.last_draw_date === today;
  const count   = sub.daily_draw_count || 0;

  if (sameDay && count >= 1) {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ allowed: false, reason: 'daily_limit', plan: 'decouverte' }));
  }

  // Autoriser : incrémenter le compteur et mémoriser la date
  await supabase
    .from('tore_subscriptions')
    .update({
      daily_draw_count: sameDay ? count + 1 : 1,
      last_draw_date:   today,
      updated_at:       new Date().toISOString()
    })
    .eq('id', sub.id);

  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ allowed: true, plan: 'decouverte' }));
}

// ============ SAVE TORE EMAIL (relance freemium) ============
async function handleSaveToreEmail(req, res) {
  const body = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Email invalide' }));
  }
  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  await supabase.from('tore_emails').upsert(
    { email, consent_marketing: false, created_at: new Date().toISOString() },
    { onConflict: 'email', ignoreDuplicates: true }
  );
  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ success: true }));
}

// ============ SAUVEGARDE DATE/LIEU DE NAISSANCE (profil membre) ============
async function handleSaveBirthInfo(req, res) {
  const body = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
  const email = (body.email || '').trim().toLowerCase();
  const birthDate = (body.birth_date || '').trim();
  const birthPlace = (body.birth_place || '').trim().slice(0, 200);
  if (!email || !email.includes('@')) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Email invalide' }));
  }
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Date de naissance invalide' }));
  }
  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { error } = await supabase
    .from('tore_subscriptions')
    .update({ birth_date: birthDate || null, birth_place: birthPlace || null, updated_at: new Date().toISOString() })
    .eq('email', email);
  if (error) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: error.message }));
  }
  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ success: true }));
}

// ============ FORGOT PASSWORD ============
async function handleForgotPassword(req, res) {
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
}

// ============ SAVE GUIDANCE TORE ============
async function handleSaveGuidanceTore(req, res) {
  const body = await new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch(e) { reject(e); } });
  });
  const { guidance_id, cards, analysis, synthesis, intention } = body;
  if (!guidance_id) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'guidance_id requis' }));
  }
  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: existing } = await supabase
    .from('guidances').select('id').eq('id', guidance_id).maybeSingle();
  if (!existing) {
    res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Guidance introuvable' }));
  }
  const { error } = await supabase.from('guidances').update({
    tore_result: { cards, analysis, synthesis },
    tore_intention: intention || null,
    tore_drawn_at: new Date().toISOString()
  }).eq('id', guidance_id);
  if (error) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: error.message }));
  }
  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ success: true }));
}

// ============ ROUTEUR PRINCIPAL ============
module.exports = async (req, res) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    return res.end();
  }

  // Déterminer l'action selon l'URL (req.url ou req.path)
  const fullUrl = (req.url || '') + (req.path || '');
  const path = (req.url?.split('?')[0] || '');

  // Log pour debug
  console.log('[Auth] Request:', req.method, 'url:', req.url, 'path:', path, 'full:', fullUrl);

  try {
    // GET /check-subscription - vérifie si l'URL contient "check-subscription"
    if (req.method === 'GET' && (path.includes('check-subscription') || fullUrl.includes('check-subscription'))) {
      return await handleCheckSubscription(req, res);
    }

    // POST routes
    if (req.method !== 'POST') {
      res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    }

    // POST /login - vérifie si l'URL contient "login"
    if (path.includes('login') || fullUrl.includes('login')) {
      return await handleLogin(req, res);
    }

    // POST /forgot-password - vérifie si l'URL contient "forgot-password"
    if (path.includes('forgot-password') || fullUrl.includes('forgot-password')) {
      return await handleForgotPassword(req, res);
    }

    // POST /refresh-session - vérifie si l'URL contient "refresh-session"
    if (path.includes('refresh-session') || fullUrl.includes('refresh-session')) {
      return await handleRefreshSession(req, res);
    }

    // POST /consume-tore-draw - vérifie si l'URL contient "consume-tore-draw"
    if (path.includes('consume-tore-draw') || fullUrl.includes('consume-tore-draw')) {
      return await handleConsumeToreDraw(req, res);
    }

    // POST /check-tore-draw — vérifie et consomme le quota journalier (Découverte)
    if (path.includes('check-tore-draw') || fullUrl.includes('check-tore-draw')) {
      return await handleCheckToreDraw(req, res);
    }

    // POST /save-tore-email — enregistre l'email pour la séquence de relance freemium
    if (path.includes('save-tore-email') || fullUrl.includes('save-tore-email')) {
      return await handleSaveToreEmail(req, res);
    }

    // POST /save-guidance-tore — sauvegarde le tirage d'une guidance en cours
    if (path.includes('save-guidance-tore') || fullUrl.includes('save-guidance-tore')) {
      return await handleSaveGuidanceTore(req, res);
    }

    // POST /save-birth-info — enregistre date/lieu de naissance (profil membre)
    if (path.includes('save-birth-info') || fullUrl.includes('save-birth-info')) {
      return await handleSaveBirthInfo(req, res);
    }

    // Route non reconnue
    console.log('[Auth] 404 - No matching route for:', path);
    res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Route non trouvée' }));

  } catch (error) {
    console.error('[Auth] Erreur:', error.message);
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, error: 'Erreur serveur' }));
  }
};
