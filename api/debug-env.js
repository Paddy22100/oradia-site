// API de diagnostic - vérifie les variables d'environnement
module.exports = (req, res) => {
  const envCheck = {
    // Stripe
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? '✅' : '❌',
    STRIPE_TORE_PRICE_ID: process.env.STRIPE_TORE_PRICE_ID ? '✅' : '❌',
    
    // Supabase  
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅' : '❌',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌',
    
    // Frontend
    FRONTEND_URL: process.env.FRONTEND_URL ? '✅' : '❌'
  };
  
  const allOk = Object.values(envCheck).every(v => v === '✅');
  
  res.status(200).json({
    status: allOk ? 'OK' : 'MISSING_VARS',
    variables: envCheck,
    timestamp: new Date().toISOString()
  });
};
