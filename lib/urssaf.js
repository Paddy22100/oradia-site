// lib/urssaf.js
// Source unique de vérité pour la base déclarable URSSAF, la ventilation par nature
// d'activité et le calcul des cotisations. Un seul exemplaire, appelé à la fois par
// GET /transactions (bloc "Déclaration URSSAF" du dashboard) et par le rapport mensuel
// envoyé par email — avant ce module, les deux divergeaient : le rapport comptait les
// précommandes dans la base, le dashboard les excluait.
//
// RÈGLE DE BASE — ENCAISSEMENT
// En micro-entreprise la comptabilité est de trésorerie : le chiffre d'affaires d'un mois
// est la somme des montants effectivement encaissés pendant ce mois, quelle que soit la
// date de facturation et quel que soit l'état d'avancement de la contrepartie. Un acompte,
// des arrhes, une précommande encaissée sont du CA du mois de l'encaissement. La notion de
// "revenu conditionnel" relève de la comptabilité d'engagement et ne s'applique pas ici.
//
// La garantie "zéro-risque" de la page précommande (remboursement intégral si l'objectif de
// financement n'est pas atteint) ne change pas la date de l'encaissement : l'argent est sur
// le compte Stripe dès le paiement réussi. Si un remboursement intervient, il se déduit du
// CA du mois où il est effectué — c'est ainsi que la régularisation se fait. Le seul cas où
// rien ne serait encaissé serait un paiement séquestré chez un tiers (plateforme de
// financement participatif type Ulule), ce qui n'est pas le montage utilisé ici.

// Fuseau de référence pour découper les mois. Les timestamps Stripe/Supabase sont en UTC :
// un paiement du 1er à 00h30 heure de Paris porte un created_at daté du 31 en UTC et
// basculerait dans le mois précédent si on tronquait l'ISO brut.
const PARIS_TZ = 'Europe/Paris';

/**
 * Convertit un timestamp ISO (UTC) en date civile YYYY-MM-DD à l'heure de Paris.
 * Remplace les `created_at.split('T')[0]` qui découpaient les mois en UTC.
 */
function parisDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA produit directement le format YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

// Les trois cases du formulaire autoentrepreneur.urssaf.fr, nommées comme elles y figurent.
const URSSAF_CASES = {
  bnc:             'Recettes des activités libérales (BNC)',
  bic_ventes:      "Chiffre d'affaires des activités de ventes de marchandises (BIC ventes)",
  bic_prestations: "Chiffre d'affaires des prestations de services commerciales ou artisanales (BIC prestations)"
};

// Taux pleins 2026. Le taux BNC n'a encore jamais été exercé (base à 0) : à confirmer auprès
// de l'URSSAF avant la première recette libérale.
const FULL_RATES = { bnc: 0.246, bic_ventes: 0.123, bic_prestations: 0.212 };
// Contribution à la formation professionnelle, qui s'ajoute aux cotisations.
const CFP_RATES  = { bnc: 0.002, bic_ventes: 0.001, bic_prestations: 0.002 };

// Acre : abattement de 50 % sur les cotisations (pas sur la CFP) pendant les douze premiers
// mois d'activité. Début d'activité le 02/03/2026 → dernier jour couvert le 31/03/2027.
// Vérifier la date exacte sur l'espace URSSAF : passé cette date les taux doublent.
const ACRE_LAST_DAY = '2027-03-31';

/**
 * Nature d'activité par source de transaction.
 * Les entrées marquées "à confirmer" reposent sur une lecture raisonnable mais n'ont pas été
 * validées par l'URSSAF — question posée depuis la messagerie de l'espace, cf. CLAUDE.md.
 */
const CATEGORY_BY_SOURCE = {
  precommande:   'bic_ventes',      // oracle physique = vente de marchandise
  abonnement:    'bic_prestations', // à confirmer : abonnement numérique, classé en prestation
                                    // de services et non en vente de marchandise (c'était
                                    // l'ancien classement, qui gonflait la base "ventes")
  guidance:      'bic_prestations', // à confirmer : pourrait relever du BNC (libéral)
  don:           'bic_ventes',      // à confirmer : don libre sur un site marchand
  'don-especes': 'bic_ventes',      // idem — encaissé en espèces, mais encaissé quand même
  manuel:        'bic_prestations'  // défaut des saisies manuelles (ménage, entretien) ;
                                    // surchargeable par transaction via urssaf_category
};
const DEFAULT_CATEGORY = 'bic_prestations';

/** Nature d'activité d'une transaction : surcharge explicite, sinon déduite de la source. */
function categoryOf(tx) {
  const explicit = tx && tx.urssaf_category;
  if (explicit && FULL_RATES[explicit] !== undefined) return explicit;
  return CATEGORY_BY_SOURCE[tx && tx.source] || DEFAULT_CATEGORY;
}

/** L'Acre s'applique-t-elle encore à cette période ? `period` = 'YYYY-MM' ou 'YYYY-MM-DD'. */
function acreApplies(period) {
  if (!period) return false;
  const day = period.length === 7 ? `${period}-01` : period.slice(0, 10);
  return day <= ACRE_LAST_DAY;
}

/**
 * Calcule la base déclarable et les cotisations d'une période.
 *
 * @param {Array}  recetteRows  lignes `type === 'recette'` de la période. Les montants
 *                              négatifs (remboursements) se soustraient naturellement.
 * @param {string} period       'YYYY-MM' ou 'YYYY-MM-DD' — sert à savoir si l'Acre joue.
 * @returns {{base:number, acre:boolean, categories:Object, cotisations:number, cfp:number, total:number}}
 */
function computeUrssaf(recetteRows, period) {
  const acre = acreApplies(period);
  const coef = acre ? 0.5 : 1;
  const categories = {};

  for (const key of Object.keys(FULL_RATES)) {
    categories[key] = {
      case: URSSAF_CASES[key],
      base: 0,
      taux: FULL_RATES[key] * coef,
      tauxCfp: CFP_RATES[key],
      cotisation: 0,
      cfp: 0
    };
  }

  for (const tx of recetteRows || []) {
    const amount = parseFloat(tx.amount);
    if (!Number.isFinite(amount)) continue;
    categories[categoryOf(tx)].base += amount;
  }

  let base = 0, cotisations = 0, cfp = 0;
  for (const key of Object.keys(categories)) {
    const c = categories[key];
    c.cotisation = c.base * c.taux;
    c.cfp = c.base * c.tauxCfp;
    base += c.base;
    cotisations += c.cotisation;
    cfp += c.cfp;
  }

  return { base, acre, acreLastDay: ACRE_LAST_DAY, categories, cotisations, cfp, total: cotisations + cfp };
}

module.exports = {
  PARIS_TZ, parisDate,
  URSSAF_CASES, FULL_RATES, CFP_RATES, ACRE_LAST_DAY,
  CATEGORY_BY_SOURCE, categoryOf, acreApplies, computeUrssaf
};
