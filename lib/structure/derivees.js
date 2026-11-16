// lib/structure/derivees.js
// Calcule, de façon déterministe et uniquement en JavaScript (jamais par le modèle de
// langage), la structure fractale cachée d'un tirage du Tore. Strictement interne :
// ce module et sa table (../../data/figures.json) ne doivent jamais être exposés au
// client — ni dans une réponse JSON, ni dans un log accessible côté navigateur. Seul
// le texte de synthèse que l'IA rédige à partir de ce calcul part vers l'utilisateur.
//
// Convention : une "figure" est une chaîne de 6 caractères '0'/'1', position 1 = ligne 1
// (bas) ... position 6 = ligne 6 (haut). '1' = trait plein (yang), '0' = trait brisé (yin).
//
// Correspondance famille → ligne (validée avec Rudy) :
//   1 Émotions · 2 Besoins · 3 Transmutation · 4 Archétypes · 5 Révélations · 6 Actions
// Mémoire Cosmos reste hors figure (carte de contexte, comme dans "Le Dialogue Intérieur").
const { figures } = require('../../data/figures.json');

const LINE_ORDER = ['emotions', 'besoins', 'transmutation', 'archetypes', 'revelations', 'actions'];

const BY_BINAIRE = new Map(figures.map(f => [f.binaire, f]));

function assertBinary(bin) {
  if (typeof bin !== 'string' || !/^[01]{6}$/.test(bin)) {
    throw new Error(`Figure invalide (attendu 6 caractères 0/1) : ${JSON.stringify(bin)}`);
  }
}

// Carte { emotions: 'yin'|'yang', ... } (une par famille de LINE_ORDER) → "010011" etc.
function binaryFromPolarities(polarityByFamily) {
  return LINE_ORDER.map(fam => {
    const p = polarityByFamily[fam];
    if (p !== 'yin' && p !== 'yang') {
      throw new Error(`Polarité manquante ou invalide pour la famille "${fam}": ${JSON.stringify(p)}`);
    }
    return p === 'yang' ? '1' : '0';
  }).join('');
}

function lookupFigure(bin) {
  assertBinary(bin);
  const entry = BY_BINAIRE.get(bin);
  if (!entry) throw new Error(`Aucune figure trouvée pour la structure binaire "${bin}" — table figures.json incomplète ?`);
  return entry;
}

function invertAll(bin) {
  assertBinary(bin);
  return bin.split('').map(c => (c === '1' ? '0' : '1')).join('');
}

// Ligne i (1-indexée) → ligne (7-i). Inverse l'ORDRE des lignes, ne change pas leur valeur.
function reverseLines(bin) {
  assertBinary(bin);
  return bin.split('').reverse().join('');
}

// Inverse uniquement les positions données (1-indexées), laisse les autres intactes.
function invertPositions(bin, positions1Indexed) {
  assertBinary(bin);
  const chars = bin.split('');
  for (const pos of positions1Indexed) {
    if (pos < 1 || pos > 6) throw new Error(`Position de ligne hors limites : ${pos}`);
    chars[pos - 1] = chars[pos - 1] === '1' ? '0' : '1';
  }
  return chars.join('');
}

// Trigramme nucléaire bas = lignes 2-3-4, haut = lignes 3-4-5 (1-indexées) de la figure
// principale, concaténés dans cet ordre pour former la nouvelle figure à 6 lignes.
function nuclearBinary(bin) {
  assertBinary(bin);
  const l = bin.split(''); // l[0]=ligne1 ... l[5]=ligne6
  return l[1] + l[2] + l[3] + l[2] + l[3] + l[4];
}

const PAIRS = [[1, 4], [2, 5], [3, 6]];

function correspondances(bin) {
  assertBinary(bin);
  return PAIRS.map(([a, b]) => {
    const va = bin[a - 1];
    const vb = bin[b - 1];
    return { lignes: [a, b], etat: va !== vb ? 'resonance' : 'blocage' };
  });
}

function troisNiveaux(bin) {
  assertBinary(bin);
  return {
    intime: { lignes: [1, 2], familles: [LINE_ORDER[0], LINE_ORDER[1]] },
    lien: { lignes: [3, 4], familles: [LINE_ORDER[2], LINE_ORDER[3]] },
    sens: { lignes: [5, 6], familles: [LINE_ORDER[4], LINE_ORDER[5]] },
  };
}

// mutantFamilies : tableau des familles (parmi LINE_ORDER) où une carte passerelle a été
// tirée (désaccord pièce/polarité) — c'est la définition de "ligne mutante" retenue.
function analyserStructure({ polarityByFamily, mutantFamilies = [] }) {
  const principale = binaryFromPolarities(polarityByFamily);
  const mutantPositions = mutantFamilies
    .map(fam => LINE_ORDER.indexOf(fam) + 1)
    .filter(pos => pos >= 1);

  const nucleaireBin = nuclearBinary(principale);
  const opposeeBin = invertAll(principale);
  const retourneeBin = reverseLines(principale);
  const devenirBin = mutantPositions.length > 0 ? invertPositions(principale, mutantPositions) : null;

  return {
    principale: lookupFigure(principale),
    nucleaire: lookupFigure(nucleaireBin),
    opposee: lookupFigure(opposeeBin),
    // null si la figure retournée est identique à la principale (figure symétrique) —
    // rien à en tirer, elle n'ajoute pas de regard différent.
    retournee: retourneeBin === principale ? null : lookupFigure(retourneeBin),
    // null s'il n'y a aucune ligne mutante dans ce tirage.
    devenir: devenirBin ? lookupFigure(devenirBin) : null,
    lignesMutantes: mutantPositions.sort((a, b) => a - b),
    correspondances: correspondances(principale),
    troisNiveaux: troisNiveaux(principale),
    lignesCentrales: [2, 5],
  };
}

// Point d'entrée pour le prompt : à partir des cartes telles qu'elles existent déjà
// dans le reste du code (array {family, name, quote, polarity, bridgeCard?}, voir
// lib/tore-deck.js / api/analyse-tirage.js), calcule toute la structure fractale.
// Retourne null si les 6 familles de LINE_ORDER ne sont pas toutes présentes avec une
// polarité valide (tirage incomplet ou appel depuis un contexte qui n'a pas ces données)
// — le prompt doit alors simplement s'en passer, jamais planter pour autant.
function structureFromCards(cards) {
  const byFamily = {};
  (cards || []).forEach(c => { if (c && c.family) byFamily[c.family] = c; });

  const complet = LINE_ORDER.every(fam => {
    const p = byFamily[fam] && byFamily[fam].polarity;
    return p === 'yin' || p === 'yang';
  });
  if (!complet) return null;

  const polarityByFamily = {};
  const mutantFamilies = [];
  const bridgeByFamily = {};
  LINE_ORDER.forEach(fam => {
    polarityByFamily[fam] = byFamily[fam].polarity;
    if (byFamily[fam].bridgeCard) {
      mutantFamilies.push(fam);
      bridgeByFamily[fam] = byFamily[fam].bridgeCard;
    }
  });

  const structure = analyserStructure({ polarityByFamily, mutantFamilies });
  return { ...structure, byFamily, bridgeByFamily };
}

module.exports = {
  LINE_ORDER,
  binaryFromPolarities,
  lookupFigure,
  invertAll,
  reverseLines,
  invertPositions,
  nuclearBinary,
  correspondances,
  troisNiveaux,
  analyserStructure,
  structureFromCards,
};
