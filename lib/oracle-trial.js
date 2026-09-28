// lib/oracle-trial.js
// Mois d'essai gratuit de l'abonnement Tore offert aux acheteurs de l'oracle physique,
// via le QR code commun imprimé dans le livret (→ https://oradia.fr/oracle-offert).
//
// - Essai Stripe de 30 jours (carte demandée, 8 €/mois ensuite sauf résiliation).
// - Réservé aux nouveaux abonnés : un email déjà abonné (Stripe) ou ayant déjà eu
//   l'essai est refusé.
// - Plafond global (ORACLE_TRIAL_MAX, 1000 par défaut = tirage du coffret) : le QR code
//   étant le même pour tous, il limite l'effet d'un partage en ligne.
// - Interrupteur oracle_qr_trial (Dashboard > Paramètres > Fonctionnalités > Boutique).
//
// Même avantage pour tous les acheteurs (site et boutiques) : conforme à l'esprit de
// la loi Lang sur les primes liées à un livre.

const ORACLE_TRIAL_DAYS = 30;
const ORACLE_TRIAL_SOURCE = 'oracle-qr';
const ORACLE_TRIAL_MAX = parseInt(process.env.ORACLE_TRIAL_MAX || '1000', 10);

async function isOracleTrialEnabled(supabase) {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'oracle_qr_trial')
      .maybeSingle();
    if (error || !data) return false; // défaut explicite : fermé si le registre est illisible
    return data.enabled === true;
  } catch {
    return false;
  }
}

async function countOracleTrials(supabase) {
  const { count, error } = await supabase
    .from('tore_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('trial_source', ORACLE_TRIAL_SOURCE);
  if (error) throw new Error(`Comptage des essais impossible : ${error.message}`);
  return count || 0;
}

// Retourne null si l'email peut bénéficier de l'essai, sinon un message à afficher.
async function oracleTrialRefusal(supabase, email) {
  const { data: rows, error } = await supabase
    .from('tore_subscriptions')
    .select('status, expires_at, stripe_customer_id, trial_source')
    .ilike('email', email);
  if (error) throw new Error(`Vérification de l'abonnement impossible : ${error.message}`);
  for (const row of rows || []) {
    if (row.trial_source) return 'Ce mois offert a déjà été utilisé avec cette adresse email.';
    if (row.stripe_customer_id) return 'Cette adresse email a déjà un abonnement au Tore : le mois offert est réservé aux nouveaux abonnés.';
    if (row.status === 'active' && row.expires_at && new Date(row.expires_at) > new Date()) {
      return 'Vous avez déjà un accès actif au Tore avec cette adresse email.';
    }
  }
  return null;
}

module.exports = {
  ORACLE_TRIAL_DAYS,
  ORACLE_TRIAL_SOURCE,
  ORACLE_TRIAL_MAX,
  isOracleTrialEnabled,
  countOracleTrials,
  oracleTrialRefusal
};
