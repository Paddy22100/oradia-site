const { createClient } = require('@supabase/supabase-js');

// Utiliser les noms exacts des variables Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validation obligatoire des variables d'environnement
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Environment variables check:');
    console.error('NEXT_PUBLIC_SUPABASE_URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.error('SUPABASE_URL:', !!process.env.SUPABASE_URL);
    console.error('SUPABASE_SERVICE_ROLE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    throw new Error(
        'Missing required Supabase environment variables. ' +
        'Expected: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
}

// Client Supabase côté serveur uniquement
// Utilise la service role key pour accès complet aux tables
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

module.exports = supabase;
