// lib/tore-deck.js
// Deck des cartes du Tore (extrait de window.DATA dans tore.html) et tirage
// serveur simplifié, utilisé par les tirages programmés (cron externe, sans
// navigateur). Deux simplifications assumées par rapport au tirage manuel :
//   - pas de carte passerelle (mécanique liée à l'animation de pièce yin/yang,
//     non répliquée côté serveur) ;
//   - hasard cryptographique local (crypto.randomBytes) plutôt que l'API QRNG
//     quantique, pour rester robuste dans une tâche automatisée sans dépendre
//     d'un service externe potentiellement indisponible.
const crypto = require('crypto');
const deck = require('../data/tore-deck.json');

const TIRAGE_ORDER = ['emotions', 'besoins', 'transmutation', 'archetypes', 'revelations', 'actions', 'memoire_cosmos'];

const FAMILY_LABELS = {
  emotions: 'Émotions',
  besoins: 'Besoins',
  transmutation: 'Transmutation',
  archetypes: 'Archétypes',
  revelations: 'Révélations',
  actions: 'Actions',
  memoire_cosmos: 'Mémoire Cosmos'
};

// Entier uniforme dans [0, max[ via rejection sampling sur crypto.randomBytes
// (évite le biais modulo d'un simple % sur une valeur aléatoire brute).
function secureRandomInt(max) {
  if (max <= 1) return 0;
  const bytesNeeded = Math.ceil(Math.log2(max) / 8) || 1;
  const totalValues = 256 ** bytesNeeded;
  const maxValid = Math.floor(totalValues / max) * max;
  let val;
  do {
    val = crypto.randomBytes(bytesNeeded).reduce((acc, b) => acc * 256 + b, 0);
  } while (val >= maxValid);
  return val % max;
}

// Tire une carte par famille (7 cartes), dans l'ordre fixe du Tore.
function drawSevenCards() {
  return TIRAGE_ORDER.map(family => {
    const pool = deck[family] || [];
    if (!pool.length) return { family, name: 'inconnue', quote: '', polarity: null };
    const card = pool[secureRandomInt(pool.length)];
    return { family, name: card.name, quote: card.quote, polarity: card.polarity };
  });
}

module.exports = { drawSevenCards, FAMILY_LABELS, TIRAGE_ORDER };
