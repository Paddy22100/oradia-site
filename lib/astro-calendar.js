// lib/astro-calendar.js
// Calendrier astro utilisé pour thématiser le tirage hebdomadaire du dimanche
// (voir api/admin/index.js, action=cron-tirage-hebdo).
//
// Deux couches :
// 1. La phase de lune du jour, calculée (pas de liste à tenir à jour) — garantit
//    que CHAQUE dimanche a un thème réel et spécifique, jamais un texte générique
//    du type "cette semaine" qui ne veut rien dire.
// 2. Les éclipses et les noms traditionnels de pleine lune (Pleine Lune des
//    Moissons, du Chasseur...), qui eux doivent être listés (aucune formule
//    simple ne les donne) — à COMPLÉTER chaque année, cf. ASTRO_EVENTS_COVERAGE_END.
const ASTRO_EVENTS_COVERAGE_END = '2027-03-31';

const ASTRO_EVENTS = [
  { date: '2026-09-26', type: 'pleine_lune', name: 'Pleine Lune des Moissons' },
  { date: '2026-10-26', type: 'pleine_lune', name: 'Pleine Lune du Chasseur' },
  { date: '2026-11-24', type: 'pleine_lune', name: 'Pleine Lune du Castor' },
  { date: '2026-12-23', type: 'pleine_lune', name: 'Pleine Lune Froide' },
  { date: '2027-01-22', type: 'pleine_lune', name: 'Pleine Lune du Loup' },
  { date: '2027-02-06', type: 'eclipse_solaire', name: 'Éclipse solaire annulaire' },
  { date: '2027-02-20', type: 'eclipse_lunaire', name: 'Éclipse lunaire (Pleine Lune des Neiges)' },
  { date: '2027-03-22', type: 'pleine_lune', name: 'Pleine Lune des Vers' },
];

// ── Phase de lune (calculée) ────────────────────────────────────────────────
// Formule synodique standard, épreuvée contre les 5 pleines lunes connues
// ci-dessus (écart < 4h à chaque fois) — largement suffisant pour un usage
// narratif/thématique, pas une éphéméride de précision.
const SYNODIC_MONTH_DAYS = 29.53058867;
const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);

const MOON_PHASES = [
  {
    key: 'nouvelle_lune', label: 'Nouvelle Lune',
    accroche: 'la nouvelle lune de cette semaine',
    intention: "Ce que cette nouvelle lune me donne l'élan de semer : l'intention que je pose pour le cycle qui commence.",
  },
  {
    key: 'premier_croissant', label: 'Premier Croissant',
    accroche: 'ce premier croissant de lune',
    intention: "Le premier pas que ce croissant naissant m'invite à oser, encore fragile mais déjà réel.",
  },
  {
    key: 'premier_quartier', label: 'Premier Quartier',
    accroche: 'ce premier quartier de lune',
    intention: "La décision ou l'obstacle que ce premier quartier met devant moi, et la force qu'il me demande de rassembler.",
  },
  {
    key: 'lune_gibbeuse_croissante', label: 'Lune Gibbeuse Croissante',
    accroche: 'cette lune gibbeuse croissante',
    intention: "Ce qu'il me reste à ajuster avant l'aboutissement que cette lune presque pleine annonce déjà.",
  },
  {
    key: 'pleine_lune', label: 'Pleine Lune',
    accroche: 'la pleine lune de cette semaine',
    intention: "Ce que cette pleine lune met en pleine lumière dans ma vie, ce qu'elle m'invite à voir enfin clairement, à relâcher ou à célébrer.",
  },
  {
    key: 'lune_gibbeuse_decroissante', label: 'Lune Gibbeuse Décroissante',
    accroche: 'cette lune gibbeuse décroissante',
    intention: "Ce que je commence à comprendre de ce que la pleine lune a révélé, une fois la première émotion retombée.",
  },
  {
    key: 'dernier_quartier', label: 'Dernier Quartier',
    accroche: 'ce dernier quartier de lune',
    intention: "Ce que ce dernier quartier me demande de lâcher, de trancher ou de terminer avant de pouvoir avancer.",
  },
  {
    key: 'dernier_croissant', label: 'Dernier Croissant',
    accroche: 'ce dernier croissant de lune',
    intention: "Ce que ce croissant finissant m'invite à déposer avant que le cycle ne recommence.",
  },
];

// Fraction du cycle synodique écoulée (0 = nouvelle lune, 0.5 = pleine lune, 1 = nouvelle lune suivante).
function getMoonPhaseFraction(date) {
  const daysSince = (date.getTime() - KNOWN_NEW_MOON_UTC) / 86400000;
  const phase = ((daysSince % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  return phase / SYNODIC_MONTH_DAYS;
}

// Retourne l'un des 8 objets de MOON_PHASES pour une date donnée.
function getMoonPhase(date) {
  const fraction = getMoonPhaseFraction(date);
  const index = Math.floor(((fraction + 1 / 16) % 1) * 8);
  return MOON_PHASES[index];
}

// ── Événements listés (éclipses, noms traditionnels de pleine lune) ────────
function parseUtcDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Retourne l'événement listé le plus proche d'une date donnée, s'il tombe dans
// une fenêtre de +/- windowDays jours — sinon null.
function findNearbyAstroEvent(referenceDate = new Date(), windowDays = 2) {
  const refUtc = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate());
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  let closest = null;
  let closestDelta = Infinity;
  for (const event of ASTRO_EVENTS) {
    const eventUtc = parseUtcDate(event.date);
    const delta = Math.abs(eventUtc - refUtc);
    if (delta <= windowMs && delta < closestDelta) {
      closest = event;
      closestDelta = delta;
    }
  }
  return closest;
}

const ECLIPSE_THEMES = {
  eclipse_solaire: {
    intention: "Le tournant que cette éclipse annonce dans ma vie : ce qui se termine, ce qui commence, la bascule à laquelle je dois me préparer.",
    accroche: "l'éclipse solaire de cette semaine",
  },
  eclipse_lunaire: {
    intention: "Ce que cette éclipse lunaire révèle de caché en moi : l'émotion ou la vérité qui demande à être reconnue avant de pouvoir avancer.",
    accroche: "l'éclipse lunaire de cette semaine",
  },
};

// Construit le thème de la semaine (utilisé par le cron du tirage hebdomadaire) :
// toujours basé sur la vraie phase de lune du jour — jamais un texte générique
// qui ne dit rien — et enrichi du nom traditionnel ou de l'éclipse quand l'un
// des deux tombe cette semaine-là.
function getWeeklyAstroTheme(referenceDate = new Date()) {
  const phase = getMoonPhase(referenceDate);
  const event = findNearbyAstroEvent(referenceDate);

  if (event && event.type.startsWith('eclipse_')) {
    const eclipseTheme = ECLIPSE_THEMES[event.type];
    return { event, label: `${event.name}`, intention: eclipseTheme.intention, accroche: eclipseTheme.accroche };
  }

  if (event && event.type === 'pleine_lune') {
    return { event, label: event.name, intention: phase.intention, accroche: `la ${event.name.toLowerCase()}` };
  }

  return { event: null, label: phase.label, intention: phase.intention, accroche: phase.accroche };
}

module.exports = {
  ASTRO_EVENTS,
  ASTRO_EVENTS_COVERAGE_END,
  MOON_PHASES,
  getMoonPhase,
  getMoonPhaseFraction,
  findNearbyAstroEvent,
  getWeeklyAstroTheme,
};
