// lib/tore-deck.js
// Deck des cartes du Tore (extrait de window.DATA dans tore.html) et tirage
// serveur complet, utilisé par les tirages programmés (cron externe, sans
// navigateur). Reproduit fidèlement le tirage manuel :
//   - hasard quantique (Outshift/ANU, via lib/qrng.js — mêmes sources que le
//     tirage manuel, avec repli crypto local en dernier recours) ;
//   - mécanique des cartes passerelles : un jet de pièce quantique par famille
//     (hors Mémoire Cosmos), comparé à la polarité de la carte tirée. En cas
//     de désaccord, une carte supplémentaire est piochée dans la famille
//     "actions" (comme le fait toujours openBridgeFan() côté client).
// Le tirage est considéré valide pour les études scientifiques (synchronicités)
// uniquement si TOUS les octets utilisés proviennent d'une source quantique
// vérifiée — voir qrngSource retourné par drawSevenCards().
const { fetchQuantumNumbers } = require('./qrng.js');
const deck = require('../data/tore-deck.json');

const TIRAGE_ORDER = ['emotions', 'besoins', 'transmutation', 'archetypes', 'revelations', 'actions', 'memoire_cosmos'];
const COIN_FAMILIES = TIRAGE_ORDER.filter(f => f !== 'memoire_cosmos');

const FAMILY_LABELS = {
  emotions: 'Émotions',
  besoins: 'Besoins',
  transmutation: 'Transmutation',
  archetypes: 'Archétypes',
  revelations: 'Révélations',
  actions: 'Actions',
  memoire_cosmos: 'Mémoire Cosmos'
};

// File d'octets quantiques consommée au fil du tirage (cartes + jets de pièce),
// avec repli crypto local si les sources quantiques sont indisponibles — le
// tirage entier est alors marqué 'fallback' (exclu des études), comme le fait
// QRNG.beginDraw()/endDraw() côté client (js/qrng-client.js).
class QuantumByteStream {
  constructor() {
    this.buffer = [];
    this.usedFallback = false;
    this.quantumSource = null; // 'anu' | 'outshift' — dernière source quantique pure rencontrée
  }

  async _refill(count) {
    const { numbers, outcome } = await fetchQuantumNumbers(count);
    if (outcome === 'anu' || outcome === 'outshift') this.quantumSource = outcome;
    else this.usedFallback = true;
    if (Array.isArray(numbers)) this.buffer.push(...numbers);
  }

  async nextByte() {
    if (this.buffer.length === 0) await this._refill(40);
    if (this.buffer.length === 0) {
      // Sécurité ultime : ne devrait jamais arriver (fetchQuantumNumbers a son
      // propre repli crypto), mais évite de bloquer le tirage indéfiniment.
      this.usedFallback = true;
      return crypto.getRandomValues(new Uint8Array(1))[0];
    }
    return this.buffer.shift();
  }

  // Entier uniforme dans [min, max[ par rejection sampling (même algorithme que
  // QRNG.getInt côté client, pour un biais identique — nul — sur les deux flux).
  async getInt(min, max) {
    const range = max - min;
    if (range <= 0) return min;
    if (range === 1) return min;
    const threshold = 256 - (256 % range);
    let raw, attempts = 0;
    do {
      raw = await this.nextByte();
      attempts++;
    } while (raw >= threshold && attempts < 8);
    return min + (raw % range);
  }

  // 'anu' | 'outshift' (100% quantique) ou 'fallback' — même sémantique que
  // QRNG.endDraw() côté client.
  purity() {
    return this.usedFallback ? 'fallback' : (this.quantumSource || 'fallback');
  }
}

// Tire les 7 cartes (une par famille) + les éventuelles cartes passerelles.
// Retourne { cards, qrngSource } — qrngSource détermine l'éligibilité aux
// études scientifiques (uniquement 'anu' ou 'outshift').
async function drawSevenCards() {
  const stream = new QuantumByteStream();
  const drawnNames = new Set();

  async function pickFrom(family) {
    const pool = deck[family] || [];
    const available = pool.filter(c => !drawnNames.has(c.name));
    const usable = available.length ? available : pool; // repli si la famille est épuisée
    if (!usable.length) return { name: 'inconnue', quote: '', polarity: null };
    const idx = await stream.getInt(0, usable.length);
    const card = usable[idx];
    drawnNames.add(card.name);
    return card;
  }

  const cards = [];
  for (const family of TIRAGE_ORDER) {
    const card = await pickFrom(family);
    cards.push({ family, name: card.name, quote: card.quote, polarity: card.polarity });
  }

  for (const family of COIN_FAMILIES) {
    const card = cards.find(c => c.family === family);
    if (!card || !card.polarity) continue;
    const bit = await stream.getInt(0, 2);
    const coinPolarity = bit === 1 ? 'yang' : 'yin';
    if (coinPolarity !== card.polarity) {
      const bridge = await pickFrom('actions');
      card.bridgeCard = { family: 'actions', name: bridge.name, quote: bridge.quote, polarity: bridge.polarity };
    }
  }

  return { cards, qrngSource: stream.purity() };
}

module.exports = { drawSevenCards, FAMILY_LABELS, TIRAGE_ORDER };
