// lib/structure/cartes-tirage.js
// Reconstruit, à partir des champs tels qu'enregistrés dans la table `tirages`
// (`cartes`: noms seuls, `passerelles`: [{carte, passerelle}]), le tableau de
// cartes { family, name, polarity, bridgeCard? } attendu par
// lib/structure/derivees.js (structureFromCards).
//
// Nécessaire car `cartes` ne garde pas la famille ni la polarité de chaque carte,
// et son ordre de stockage ne suit pas forcément LINE_ORDER (cause exacte non
// élucidée côté client, voir tore.html) — on retrouve donc chaque carte par
// recherche exhaustive dans data/tore-deck.json plutôt que par position.
const deck = require('../../data/tore-deck.json');
const { LINE_ORDER } = require('./derivees.js');

const ALL_FAMILIES = [...LINE_ORDER, 'memoire_cosmos'];

// `passerelles.passerelle` est stocké comme un slug (ex. "se_retirer"), pas le nom
// réel de la carte ("SE RETIRER") — repéré en testant ce module sur un tirage réel.
// `cartes`, lui, contient déjà les noms réels. On normalise donc les deux côtés en
// un même slug pour que la recherche fonctionne quel que soit le format reçu.
function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const BY_SLUG = new Map();
ALL_FAMILIES.forEach(fam => {
  (deck[fam] || []).forEach(c => {
    BY_SLUG.set(slugify(c.name), { family: fam, name: c.name, polarity: c.polarity || null, quote: c.quote || '' });
  });
});

// Nom (ou slug) de carte → { family, name, polarity, quote } (name = nom réel,
// même si l'entrée reçue était un slug).
function findCardFamily(name) {
  return BY_SLUG.get(slugify(name)) || null;
}

// cartes: string[] ; passerelles: [{carte, passerelle}]
// Retourne { cards, incomplete } — cards au format attendu par structureFromCards ;
// incomplete liste les noms non retrouvés dans data/tore-deck.json (carte retirée/
// renommée depuis le tirage), pour que l'appelant renonce proprement plutôt que de
// planter ou de produire une structure erronée.
function reconstruireCartesDepuisTirage({ cartes, passerelles }) {
  const noms = Array.isArray(cartes) ? cartes : [];
  const ponts = Array.isArray(passerelles) ? passerelles : [];
  const pontParCarte = new Map(ponts.map(p => [slugify(p.carte), p.passerelle]));

  const incomplete = [];
  const cards = [];

  for (const name of noms) {
    const found = findCardFamily(name);
    if (!found) { incomplete.push(name); continue; }

    const card = { family: found.family, name: found.name, polarity: found.polarity, quote: found.quote };

    const bridgeRaw = pontParCarte.get(slugify(name));
    if (bridgeRaw) {
      const bridgeFound = findCardFamily(bridgeRaw);
      if (bridgeFound) {
        card.bridgeCard = { family: bridgeFound.family, name: bridgeFound.name, polarity: bridgeFound.polarity, quote: bridgeFound.quote };
      } else {
        incomplete.push(bridgeRaw);
      }
    }
    cards.push(card);
  }

  return { cards, incomplete };
}

module.exports = { reconstruireCartesDepuisTirage, findCardFamily };
