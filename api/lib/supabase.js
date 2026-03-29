const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validation obligatoire des variables d'environnement
if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
        'Missing required Supabase environment variables. ' +
        'Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
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
