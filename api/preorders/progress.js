const { createClient } = require('@supabase/supabase-js');

// Paliers de financement — montants issus des devis fabricant réels (WJPC,
// août 2026, 1000 exemplaires, conversion $→€ ~0,863). Constantes de config,
// à mettre à jour manuellement si les devis changent — jamais recalculées
// depuis un nombre de précommandes ou un objectif arbitraire.
const PALIERS = [
  {
    id: 1,
    seuil: 700,
    titre: 'Prototype financé',
    description: 'Le prototype physique complet peut être commandé et validé.'
  },
  {
    id: 2,
    seuil: 3500,
    titre: 'Acompte de production',
    description: "L'acompte est couvert : la fabrication démarre officiellement."
  },
  {
    id: 3,
    seuil: 14000,
    titre: 'Financement complet',
    description: 'La production et la livraison des 1000 premiers exemplaires sont intégralement financées.'
  }
];

function getSupabaseClient() {
  // URL Supabase du projet oradia-prod (nxzetkdozynyutlbhxdx)
  const supabaseUrl = process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, supabaseKey);
}

function setCORS(req, res) {
  const allowedOrigins = [
    'https://oradia.fr',
    'https://www.oradia.fr',
    'https://oradia-site-trail.vercel.app',
    'https://oradia.vercel.app'
  ];

  const origin = req.headers?.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

module.exports = async (req, res) => {
  try {
    setCORS(req, res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        message: 'Méthode non autorisée'
      });
    }

    // Si pas de config Supabase, retourner des valeurs par défaut
    const hasSupabaseConfig = process.env.SUPABASE_SERVICE_ROLE_KEY && 
                              (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    
    let sold = 0;
    let cagnotte = 0;

    if (hasSupabaseConfig) {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('preorders')
          .select('id, items, paid_status, amount_total')
          .eq('paid_status', 'completed');

        if (error) {
          console.error('Progress query failed:', error.message);
        } else {
          for (const row of data || []) {
            if (Array.isArray(row.items) && row.items.length > 0) {
              const qty = row.items.reduce((sum, item) => {
                const q = Number(item?.quantity);
                return sum + (Number.isFinite(q) && q > 0 ? q : 0);
              }, 0);
              sold += qty > 0 ? qty : 1;
            } else {
              sold += 1;
            }
            // amount_total sur preorders est en euros (voir api/stripe-webhook.js)
            cagnotte += Number(row.amount_total) || 0;
          }
        }

        // amount_total sur donors est aussi en euros depuis la correction
        // appliquée par donors-amount-correction.sql (ne pas diviser par 100).
        const { data: donorRows, error: donorsError } = await supabase
          .from('donors')
          .select('amount_total, paid_status')
          .eq('paid_status', 'completed');

        if (donorsError) {
          console.error('Donors query failed:', donorsError.message);
        } else {
          for (const row of donorRows || []) {
            cagnotte += Number(row.amount_total) || 0;
          }
        }

        // Backers Kickstarter (import manuel CSV, voir dashboard admin) : comptés au même
        // titre que les précommandes directes, 1 backer ≈ 1 oracle (même niveau d'estimation
        // que le reste de ce compteur), et leur pledge entre dans la cagnotte au même titre
        // qu'une précommande ou un don. Seuls les pledges en EUR sont sommés — même règle que
        // côté dashboard admin (lib/stripe-fees.js, import-transactions) : pas de taux de
        // change inventé pour les autres devises. La table peut ne pas encore exister si la
        // migration supabase-migration-kickstarter-backers.sql n'a pas été appliquée : on
        // ignore l'erreur plutôt que de casser le compteur public de précommandes.
        const { data: ksRows, error: ksError } = await supabase
          .from('kickstarter_backers')
          .select('id, pledge_amount, currency');
        if (!ksError && Array.isArray(ksRows)) {
          sold += ksRows.length;
          for (const row of ksRows) {
            if ((row.currency || 'EUR').toUpperCase() === 'EUR') {
              cagnotte += Number(row.pledge_amount) || 0;
            }
          }
        }
      } catch (dbError) {
        console.error('Database error:', dbError.message);
      }
    } else {
      console.warn('Supabase not configured - returning default values');
    }

    // Objectif de prévente (jamais affiché tel quel sur le site — seuls le
    // pourcentage et le nombre vendu sont montrés publiquement)
    const goal = Number(process.env.PREORDER_GOAL || 200);
    const remaining = Math.max(goal - sold, 0);
    const percent = goal > 0 ? Math.min(Math.round((sold / goal) * 100), 100) : 0;

    // Statut de chaque palier de financement, calculé depuis la cagnotte réelle.
    // Le premier palier non atteint est "en cours" ; les suivants "a-venir".
    let nextPending = true;
    const paliers = PALIERS.map((p) => {
      const atteint = cagnotte >= p.seuil;
      let status = 'a-venir';
      if (atteint) {
        status = 'atteint';
      } else if (nextPending) {
        status = 'en-cours';
        nextPending = false;
      }
      return {
        id: p.id,
        seuil: p.seuil,
        titre: p.titre,
        description: p.description,
        status,
        percent: Math.min(100, Math.round((cagnotte / p.seuil) * 100))
      };
    });
    const allPaliersReached = paliers.every((p) => p.status === 'atteint');

    return res.status(200).json({
      success: true,
      sold,
      goal,
      remaining,
      percent,
      cagnotte,
      paliers,
      allPaliersReached
    });
  } catch (error) {
    console.error('Preorder progress failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Impossible de charger la progression'
    });
  }
};
