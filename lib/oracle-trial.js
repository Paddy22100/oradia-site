// lib/oracle-trial.js
// Mois d'essai gratuit de l'abonnement Tore offert aux acheteurs de l'oracle physique,
// via le QR code commun imprimé dans le livret (→ https://oradia.fr/oracle-offert).
//
// - Essai Stripe de 30 jours (carte demandée, 8 €/mois ensuite sauf résiliation).
// - Réservé aux nouveaux abonnés : un email déjà abonné (Stripe) ou ayant déjà eu
//   l'essai est refusé.
// - Plafond global (1000 par défaut = tirage du coffret) : le QR code étant le même pour
//   tous, il limite l'effet d'un partage en ligne. Plafond et seuil d'alerte (%) sont
//   réglables depuis Dashboard > Analytique (table app_settings, clé oracle_trial) ;
//   ORACLE_TRIAL_MAX (Vercel) ne sert que de repli si la table est illisible.
// - Alerte email à contact@oradia.fr quand le seuil puis le plafond sont atteints
//   (une fois par palier et par valeur de plafond).
// - Interrupteur oracle_qr_trial (Dashboard > Paramètres > Fonctionnalités > Boutique).
//
// Même avantage pour tous les acheteurs (site et boutiques) : conforme à l'esprit de
// la loi Lang sur les primes liées à un livre.

const ORACLE_TRIAL_DAYS = 30;
const ORACLE_TRIAL_SOURCE = 'oracle-qr';
const ORACLE_TRIAL_MAX = parseInt(process.env.ORACLE_TRIAL_MAX || '1000', 10);
const ORACLE_TRIAL_ALERT_PCT = 80;
const SETTINGS_KEY = 'oracle_trial';
const ALERT_STATE_KEY = 'oracle_trial_alert_state';

async function getOracleTrialSettings(supabase) {
  const fallback = { max: ORACLE_TRIAL_MAX, alertPct: ORACLE_TRIAL_ALERT_PCT };
  try {
    const { data, error } = await supabase
      .from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
    if (error || !data?.value) return fallback;
    const max = parseInt(data.value.max, 10);
    const alertPct = parseInt(data.value.alertPct, 10);
    return {
      max: Number.isFinite(max) && max >= 0 ? max : fallback.max,
      alertPct: Number.isFinite(alertPct) && alertPct > 0 && alertPct <= 100 ? alertPct : fallback.alertPct
    };
  } catch {
    return fallback;
  }
}

// Valide et enregistre { max, alertPct }. Retourne les valeurs enregistrées.
async function setOracleTrialSettings(supabase, { max, alertPct }) {
  const m = parseInt(max, 10);
  const a = parseInt(alertPct, 10);
  if (!Number.isFinite(m) || m < 0 || m > 100000) throw new Error('Plafond invalide (entre 0 et 100 000)');
  if (!Number.isFinite(a) || a < 1 || a > 100) throw new Error("Seuil d'alerte invalide (entre 1 et 100 %)");
  const value = { max: m, alertPct: a };
  const { error } = await supabase.from('app_settings')
    .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return value;
}

// Niveau atteint : 'full' (plafond), 'warn' (seuil d'alerte) ou null.
function oracleTrialLevel(used, { max, alertPct }) {
  if (used >= max) return 'full';
  if (used >= Math.ceil(max * alertPct / 100)) return 'warn';
  return null;
}

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

// Statistiques pour le dashboard (Analytique) : essais créés, en cours, poursuivis en
// abonnement payant, résiliés, et visites de la page du QR code.
async function getOracleTrialStats(supabase) {
  const settings = await getOracleTrialSettings(supabase);
  const { data: rows, error } = await supabase
    .from('tore_subscriptions')
    .select('status, created_at, expires_at')
    .eq('trial_source', ORACLE_TRIAL_SOURCE);
  if (error) throw new Error(error.message);
  const now = Date.now();
  const trialEnd = (r) => new Date(r.created_at).getTime() + ORACLE_TRIAL_DAYS * 86400000;
  let inTrial = 0, converted = 0, stopped = 0;
  for (const r of rows || []) {
    const active = r.status === 'active' && (!r.expires_at || new Date(r.expires_at).getTime() > now);
    if (!active) stopped++;
    else if (trialEnd(r) > now) inTrial++;
    else converted++;
  }
  let scans = null, scanVisitors = null;
  try {
    const { data: views } = await supabase
      .from('page_views').select('session_id')
      .in('path', ['/oracle-offert', '/oracle-offert.html', '/oracle-offert/']);
    if (Array.isArray(views)) {
      scans = views.length;
      scanVisitors = new Set(views.map(v => v.session_id).filter(Boolean)).size;
    }
  } catch { /* table page_views indisponible : pas de compteur de visites */ }
  const used = (rows || []).length;
  return {
    used, max: settings.max, alertPct: settings.alertPct,
    remaining: Math.max(0, settings.max - used),
    level: oracleTrialLevel(used, settings),
    inTrial, converted, stopped, scans, scanVisitors
  };
}

// Appelée après chaque essai activé (webhook Stripe) : email à l'admin quand le seuil
// d'alerte puis le plafond sont franchis. Une seule fois par palier et par plafond
// (état mémorisé dans app_settings) ; relancée si le plafond est modifié.
async function checkOracleTrialAlert(supabase) {
  try {
    const settings = await getOracleTrialSettings(supabase);
    const used = await countOracleTrials(supabase);
    const level = oracleTrialLevel(used, settings);
    if (!level) return;
    const { data: st } = await supabase
      .from('app_settings').select('value').eq('key', ALERT_STATE_KEY).maybeSingle();
    const prev = st?.value || {};
    const rank = { warn: 1, full: 2 };
    if (prev.max === settings.max && (rank[prev.level] || 0) >= rank[level]) return;
    if (!process.env.BREVO_API_KEY) return;
    const subject = level === 'full'
      ? `🚫 Oradia — Mois offert (QR code oracle) : plafond atteint (${used} / ${settings.max})`
      : `⚠️ Oradia — Mois offert (QR code oracle) : ${used} / ${settings.max} essais utilisés`;
    const body = level === 'full'
      ? `<p>Le plafond de <strong>${settings.max}</strong> mois offerts est atteint : la page oradia.fr/oracle-offert propose désormais l'abonnement sans essai gratuit.</p>`
      : `<p><strong>${used}</strong> mois offerts sur <strong>${settings.max}</strong> ont été utilisés (seuil d'alerte : ${settings.alertPct} %). Il en reste <strong>${settings.max - used}</strong>.</p>`;
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Oradia Système', email: 'contact@oradia.fr' },
        to: [{ email: 'contact@oradia.fr' }],
        subject,
        htmlContent: `${body}<p>Suivi et réglage du plafond : Dashboard admin › Analytique › « Mois offert (QR code oracle) ».</p>`
      })
    });
    if (!r.ok) return;
    await supabase.from('app_settings').upsert({
      key: ALERT_STATE_KEY,
      value: { level, max: settings.max, used, at: new Date().toISOString() },
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
  } catch (e) {
    console.error('[oracle-trial] alerte non envoyée:', e.message);
  }
}

module.exports = {
  ORACLE_TRIAL_DAYS,
  ORACLE_TRIAL_SOURCE,
  ORACLE_TRIAL_MAX,
  getOracleTrialSettings,
  setOracleTrialSettings,
  getOracleTrialStats,
  checkOracleTrialAlert,
  isOracleTrialEnabled,
  countOracleTrials,
  oracleTrialRefusal
};
