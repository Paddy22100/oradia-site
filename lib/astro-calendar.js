// lib/astro-calendar.js
// Contexte astro complet (Soleil, Lune, planètes) utilisé pour thématiser le
// tirage hebdomadaire du dimanche (voir api/admin/index.js, action=cron-tirage-hebdo).
//
// Positions calculées via astronomy-engine (précision suffisante très large-
// ment pour un usage narratif/thématique — vérifié contre les dates connues :
// pleines lunes 2026-2027 à moins de 4h près, et les 3 rétrogradations de
// Mercure de 2026 exactement). Seuls les noms traditionnels de pleine lune
// (Pleine Lune des Moissons, du Chasseur...) et les éclipses doivent être
// listés à la main (aucune formule simple ne les donne) — à COMPLÉTER chaque
// année, cf. ASTRO_EVENTS_COVERAGE_END.
const Astronomy = require('astronomy-engine');

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

// ── Signes du zodiaque (tropical, 30° chacun à partir du point vernal) ──────
const ZODIAC_SIGNS = [
  'Bélier', 'Taureau', 'Gémeaux', 'Cancer', 'Lion', 'Vierge',
  'Balance', 'Scorpion', 'Sagittaire', 'Capricorne', 'Verseau', 'Poissons'
];

function getZodiacSign(longitudeDeg) {
  const normalized = ((longitudeDeg % 360) + 360) % 360;
  return ZODIAC_SIGNS[Math.floor(normalized / 30)];
}

// Longitude écliptique géocentrique apparente (degrés, 0-360) d'un corps —
// Astronomy.EclipticLongitude() donne l'HÉLIOCENTRIQUE (inutilisable pour le
// Soleil lui-même, et pas ce qu'on veut pour le signe zodiacal "vu depuis la
// Terre") : on passe donc par GeoVector + Ecliptic pour les planètes, et par
// les fonctions dédiées, plus précises, pour le Soleil et la Lune.
function getEclipticLongitude(body, date) {
  if (body === Astronomy.Body.Sun) return Astronomy.SunPosition(date).elon;
  if (body === Astronomy.Body.Moon) return Astronomy.EclipticGeoMoon(date).lon;
  return Astronomy.Ecliptic(Astronomy.GeoVector(body, date, true)).elon;
}

// Rétrograde = longitude décroissante d'un jour sur l'autre (mouvement apparent
// inversé vu depuis la Terre) — vérifié exact sur les 3 rétrogradations de
// Mercure en 2026 (26 fév-20 mars, 30 juin-23 juil, 24 oct-13 nov).
function isRetrograde(body, date) {
  const l1 = getEclipticLongitude(body, date);
  const l2 = getEclipticLongitude(body, new Date(date.getTime() + 86400000));
  let diff = l2 - l1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}

const MOON_PHASES = [
  { key: 'nouvelle_lune', label: 'Nouvelle Lune', intention: "Qu'est-ce que cette nouvelle lune annonce du déroulement de la semaine à venir ? Quel élan est bon à semer maintenant." },
  { key: 'premier_croissant', label: 'Premier Croissant', intention: "Qu'est-ce que ce premier croissant annonce du déroulement de la semaine à venir ? Quel premier pas, encore fragile, sera le bon à oser." },
  { key: 'premier_quartier', label: 'Premier Quartier', intention: "Qu'est-ce que ce premier quartier annonce du déroulement de la semaine à venir ? Quelle décision ou quel obstacle va se présenter, et quelle force il faudra rassembler." },
  { key: 'lune_gibbeuse_croissante', label: 'Lune Gibbeuse Croissante', intention: "Qu'est-ce que cette lune gibbeuse croissante annonce du déroulement de la semaine à venir ? Quels ajustements restent à faire avant l'aboutissement qui approche." },
  { key: 'pleine_lune', label: 'Pleine Lune', intention: "Qu'est-ce que cette pleine lune annonce du déroulement de la semaine à venir ? Ce qu'elle va mettre en pleine lumière, à voir enfin clairement, à relâcher ou à célébrer." },
  { key: 'lune_gibbeuse_decroissante', label: 'Lune Gibbeuse Décroissante', intention: "Qu'est-ce que cette lune gibbeuse décroissante annonce du déroulement de la semaine à venir ? Ce qui va se clarifier une fois la première émotion de la pleine lune retombée." },
  { key: 'dernier_quartier', label: 'Dernier Quartier', intention: "Qu'est-ce que ce dernier quartier annonce du déroulement de la semaine à venir ? Ce qu'il va falloir lâcher, trancher ou terminer avant de pouvoir avancer." },
  { key: 'dernier_croissant', label: 'Dernier Croissant', intention: "Qu'est-ce que ce dernier croissant annonce du déroulement de la semaine à venir ? Ce qu'il est temps de déposer avant que le cycle ne recommence." },
];

// Astronomy.MoonPhase() renvoie l'angle de phase exact (0=nouvelle, 90=premier
// quartier, 180=pleine, 270=dernier quartier) — bien plus précis que le calcul
// synodique approximatif utilisé initialement ici.
function getMoonPhase(date) {
  const angle = Astronomy.MoonPhase(date);
  const index = Math.floor(((angle / 360 + 1 / 16) % 1) * 8);
  return MOON_PHASES[index];
}

// Planètes "visibles à l'œil nu", celles que l'astrologie hebdomadaire courante
// commente (Uranus/Neptune/Pluton bougent trop lentement pour être pertinentes
// d'une semaine à l'autre).
const PLANETS = [
  { key: 'mercure', body: Astronomy.Body.Mercury, name: 'Mercure' },
  { key: 'venus', body: Astronomy.Body.Venus, name: 'Vénus' },
  { key: 'mars', body: Astronomy.Body.Mars, name: 'Mars' },
  { key: 'jupiter', body: Astronomy.Body.Jupiter, name: 'Jupiter' },
  { key: 'saturne', body: Astronomy.Body.Saturn, name: 'Saturne' },
];

// Contexte astro complet du jour : signe du Soleil, signe + phase de la Lune,
// et pour chaque planète son signe, si elle est rétrograde, et si elle vient
// de changer de signe cette semaine (comparé à 7 jours plus tôt) — c'est ce
// qui distingue un "événement de la semaine" (à mentionner) d'un simple état
// de fond qui n'a pas bougé depuis des mois (à ne pas répéter chaque dimanche).
function getFullAstroContext(date) {
  const sunSign = getZodiacSign(getEclipticLongitude(Astronomy.Body.Sun, date));
  const moonSign = getZodiacSign(getEclipticLongitude(Astronomy.Body.Moon, date));
  const moonPhase = getMoonPhase(date);
  const weekAgo = new Date(date.getTime() - 7 * 86400000);

  const planets = PLANETS.map(p => {
    const sign = getZodiacSign(getEclipticLongitude(p.body, date));
    const signAWeekAgo = getZodiacSign(getEclipticLongitude(p.body, weekAgo));
    return {
      key: p.key,
      name: p.name,
      sign,
      retrograde: isRetrograde(p.body, date),
      justChangedSign: sign !== signAWeekAgo,
    };
  });

  return { sun: { sign: sunSign }, moon: { sign: moonSign, phase: moonPhase }, planets };
}

// Phrase décrivant le contexte astro de la semaine, pour l'intention du tirage
// IA et l'intro de la newsletter. Toujours le Soleil + la Lune (les éléments
// qui changent chaque semaine) ; les planètes ne sont mentionnées que si elles
// sont rétrogrades ou viennent de changer de signe (les "événements" de la
// semaine) — les citer systématiquement, immobiles pendant des mois, serait
// aussi creux que l'ancien texte générique "cette semaine".
function describeAstroContext(context) {
  const parts = [];
  parts.push(`Le Soleil est en ${context.sun.sign} et la Lune en ${context.moon.sign}, en ${context.moon.phase.label}.`);

  const notable = context.planets.filter(p => p.retrograde || p.justChangedSign);
  notable.forEach(p => {
    if (p.retrograde) {
      parts.push(`${p.name} est rétrograde en ${p.sign}.`);
    } else if (p.justChangedSign) {
      parts.push(`${p.name} vient d'entrer en ${p.sign}.`);
    }
  });

  return parts.join(' ');
}

function parseUtcDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Retourne l'événement listé (éclipse, nom traditionnel de pleine lune) le
// plus proche d'une date donnée, s'il tombe dans une fenêtre de +/- windowDays
// jours — sinon null.
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

const ECLIPSE_INTENTIONS = {
  eclipse_solaire: "Qu'est-ce que cette éclipse solaire annonce du déroulement de la semaine à venir ? Le tournant qui se prépare, ce qui se termine, ce qui commence.",
  eclipse_lunaire: "Qu'est-ce que cette éclipse lunaire annonce du déroulement de la semaine à venir ? L'émotion ou la vérité cachée qui va demander à être reconnue.",
};

// Construit le thème de la semaine (utilisé par le cron du tirage hebdomadaire) :
// toujours basé sur le contexte astro réel du jour (Soleil, Lune, planètes
// notables) — jamais un texte générique qui ne dit rien — et enrichi du nom
// traditionnel de pleine lune ou de l'éclipse quand l'un des deux tombe cette
// semaine-là.
function getWeeklyAstroTheme(referenceDate = new Date()) {
  const context = getFullAstroContext(referenceDate);
  const contextSentence = describeAstroContext(context);
  const event = findNearbyAstroEvent(referenceDate);

  const baseIntention = event && event.type.startsWith('eclipse_')
    ? ECLIPSE_INTENTIONS[event.type]
    : context.moon.phase.intention;

  const label = event ? event.name : `${context.moon.phase.label} en ${context.moon.sign}`;

  return {
    event,
    context,
    label,
    contextSentence,
    intention: `${contextSentence} ${baseIntention}`,
    accroche: event ? event.name.toLowerCase() : `${context.moon.phase.label.toLowerCase()} en ${context.moon.sign}`,
  };
}

module.exports = {
  ASTRO_EVENTS,
  ASTRO_EVENTS_COVERAGE_END,
  ZODIAC_SIGNS,
  MOON_PHASES,
  PLANETS,
  getZodiacSign,
  getEclipticLongitude,
  isRetrograde,
  getMoonPhase,
  getFullAstroContext,
  describeAstroContext,
  findNearbyAstroEvent,
  getWeeklyAstroTheme,
};
