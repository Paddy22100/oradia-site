// lib/retro-stats.js
// Statistiques partagées de l'étude rétrocausalité (api/admin/index.js :
// /experiment-stats, /experiment-public). Auparavant dupliqué à l'identique dans
// les deux routes ; centralisé ici pour n'avoir qu'une seule définition de ce
// qu'est un "bras" (passé ou futur) de l'étude, et des segmentations exploratoires
// (résonance subjective, concurrence de tirages) qui s'appuient dessus.

// p-value bilatérale depuis un z : erfc(|z|/√2), approx. Abramowitz & Stegun 7.1.26
function twoSidedP(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.max(0, Math.min(1, 1 - erf));
}

// Statistiques d'un "bras" : correspondance present_bit vs (past_bit|future_bit).
function arm(rows, key) {
  const valid = (rows || []).filter(r => r.present_bit != null && r[key] != null);
  const n = valid.length;
  if (n === 0) return { n: 0, matches: 0, rate: null, baseline: null, deviation: null, z: null, p: null, significant: false };
  let matches = 0, sumP = 0, sumO = 0;
  for (const r of valid) { if (r.present_bit === r[key]) matches++; sumP += r.present_bit; sumO += r[key]; }
  const pPresent = sumP / n, pOther = sumO / n;
  const baseline = pPresent * pOther + (1 - pPresent) * (1 - pOther); // match attendu sous indépendance
  const rate = matches / n;
  const se = Math.sqrt(baseline * (1 - baseline) / n) || 0;
  const z = se > 0 ? (rate - baseline) / se : 0;
  const p = twoSidedP(z);
  return { n, matches, rate, baseline, deviation: rate - baseline, z, p, significant: p < 0.05 };
}

// Segmentation exploratoire "concurrence de tirages" : pour chaque session, compte
// combien d'AUTRES sessions ont une intention_at à moins de `windowMinutes` minutes
// (dans les deux sens). 'solo' = aucune autre session dans la fenêtre, 'accompagne'
// = au moins une. Alternative à un "groupe B" à nombre partagé (contesté, et
// incompatible avec la garantie "un nombre scellé = une seule consommation") :
// ici on regarde si la présence d'autres intentions simultanées change le taux de
// correspondance, sans jamais réutiliser un nombre scellé.
//
// rows : [{..., intention_at: ISOString}], retourne une Map id -> 'solo'|'accompagne'.
function concurrencyLabels(rows, windowMinutes = 10) {
  const windowMs = windowMinutes * 60 * 1000;
  const withTime = (rows || [])
    .map(r => ({ id: r.id, t: new Date(r.intention_at).getTime() }))
    .filter(r => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);

  const labels = new Map();
  let lo = 0;
  for (let i = 0; i < withTime.length; i++) {
    const t = withTime[i].t;
    while (withTime[lo].t < t - windowMs) lo++;
    let hi = i;
    while (hi + 1 < withTime.length && withTime[hi + 1].t <= t + windowMs) hi++;
    // [lo, hi] inclut la session elle-même : "accompagné" dès que la plage contient
    // au moins un autre id qu'elle-même.
    const others = (hi - lo + 1) - 1;
    labels.set(withTime[i].id, others > 0 ? 'accompagne' : 'solo');
  }
  return labels;
}

const RESONANCE_GROUP = { fort: 'forte', plutot_oui: 'forte', peu: 'faible', non: 'faible' };

// Segmentation exploratoire "résonance subjective" : relie chaque retro_session (via
// son session_id) à la fenêtre d'observation qui porte le même session_id, puis à la
// réponse du questionnaire de clôture (resonance_tirage) pour cette fenêtre. Un
// retro_session sans fenêtre correspondante, ou dont le questionnaire n'a pas encore
// de réponse, reste simplement hors segmentation (ni "forte" ni "faible").
//
// rows : retro_sessions [{id, session_id}], observationWindows : [{id, session_id}],
// responses : [{observation_window_id, resonance_tirage}]. Retourne Map id -> 'forte'|'faible'.
function resonanceLabels(rows, observationWindows, responses) {
  const sessionIdToWindowId = new Map();
  for (const w of (observationWindows || [])) { if (w.session_id) sessionIdToWindowId.set(w.session_id, w.id); }

  const windowIdToResonance = new Map();
  for (const r of (responses || [])) { if (r.observation_window_id) windowIdToResonance.set(r.observation_window_id, r.resonance_tirage); }

  const labels = new Map();
  for (const row of (rows || [])) {
    if (!row.session_id) continue;
    const winId = sessionIdToWindowId.get(row.session_id);
    if (winId == null) continue;
    const label = RESONANCE_GROUP[windowIdToResonance.get(winId)];
    if (label) labels.set(row.id, label);
  }
  return labels;
}

// Regroupe des lignes {id,...} selon une Map id -> label, puis calcule arm(past|future)
// pour chaque groupe. groupLabels : liste des valeurs de label à produire (groupes vides
// omis du calcul mais présents avec n:0 pour rester affichables côté dashboard).
function statsByLabel(rows, labelById, groupLabels) {
  const byLabel = {};
  for (const label of groupLabels) byLabel[label] = [];
  for (const r of rows) {
    const label = labelById.get(r.id);
    if (label && byLabel[label]) byLabel[label].push(r);
  }
  const out = {};
  for (const label of groupLabels) {
    out[label] = { n: byLabel[label].length, past: arm(byLabel[label], 'past_bit'), future: arm(byLabel[label], 'future_bit') };
  }
  return out;
}

module.exports = { twoSidedP, arm, concurrencyLabels, resonanceLabels, statsByLabel };
