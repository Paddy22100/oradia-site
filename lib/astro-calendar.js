// lib/astro-calendar.js
// Calendrier des événements astro (pleines lunes, éclipses) utilisé pour thématiser
// le tirage hebdomadaire du dimanche (voir api/admin/index.js, action=cron-tirage-hebdo).
//
// Sources : recoupement de calendriers astronomiques publics (dates UTC, arrondies au
// jour). À COMPLÉTER chaque année — la liste ne couvre que jusqu'à la date indiquée
// dans ASTRO_EVENTS_COVERAGE_END ; au-delà, getWeeklyAstroTheme() retombe sur le thème
// générique par défaut plutôt que d'échouer.
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

// Thèmes d'intention par type d'événement — utilisés pour orienter le tirage IA
// (voir buildWeeklyIntention ci-dessous) et l'accroche de la newsletter.
const THEME_BY_TYPE = {
  pleine_lune: {
    label: 'Pleine Lune',
    intention: "Ce que cette pleine lune met en pleine lumière dans ma vie, ce qu'elle m'invite à voir enfin clairement, à relâcher ou à célébrer.",
    accroche: 'la pleine lune de cette semaine',
  },
  eclipse_solaire: {
    label: 'Éclipse solaire',
    intention: "Le tournant que cette éclipse annonce dans ma vie : ce qui se termine, ce qui commence, la bascule à laquelle je dois me préparer.",
    accroche: "l'éclipse solaire de cette semaine",
  },
  eclipse_lunaire: {
    label: 'Éclipse lunaire',
    intention: "Ce que cette éclipse lunaire révèle de caché en moi : l'émotion ou la vérité qui demande à être reconnue avant de pouvoir avancer.",
    accroche: "l'éclipse lunaire de cette semaine",
  },
  defaut: {
    label: 'Tirage de la semaine',
    intention: "Ce que cette semaine me demande de regarder en face, d'accueillir ou de préparer.",
    accroche: 'cette semaine',
  },
};

function parseUtcDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Retourne l'événement astro le plus proche d'une date donnée (par défaut aujourd'hui),
// s'il tombe dans une fenêtre de +/- windowDays jours — sinon null (semaine "normale").
function findNearbyAstroEvent(referenceDate = new Date(), windowDays = 3) {
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

// Construit le thème de la semaine (utilisé par le cron du tirage hebdomadaire) :
// l'événement astro proche s'il y en a un, sinon le thème générique par défaut.
function getWeeklyAstroTheme(referenceDate = new Date()) {
  const event = findNearbyAstroEvent(referenceDate);
  const theme = event ? THEME_BY_TYPE[event.type] : THEME_BY_TYPE.defaut;
  return {
    event,
    label: event ? `${theme.label} — ${event.name}` : theme.label,
    intention: theme.intention,
    accroche: theme.accroche,
  };
}

module.exports = {
  ASTRO_EVENTS,
  ASTRO_EVENTS_COVERAGE_END,
  findNearbyAstroEvent,
  getWeeklyAstroTheme,
};
