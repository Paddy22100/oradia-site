// __tests__/fractal-instruction.test.js
// Vérifie buildFractalInstruction() (lib/tore-analysis-prompt.js) : dégradation
// propre si les données manquent, déduplication des figures coïncidentes, et absence
// de tout terme réservé dans le texte généré — exhaustivement, puisque l'espace des
// combinaisons est petit (2^6 polarités × 2^6 sous-ensembles de lignes mutantes).
// Ceci teste le texte DÉTERMINISTE construit par notre propre code, pas le texte
// généré par l'IA (qui reste couvert par scripts/test-fuites-synthese.js, Étape 4).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildAnalysisPrompt, buildFractalInstruction } = require('../lib/tore-analysis-prompt.js');
const { LINE_ORDER } = require('../lib/structure/derivees.js');

const FORBIDDEN = ['yi jing', 'yi king', 'i ching', 'livre des mutations', 'hexagramme', 'trigramme', 'nucléaire', 'king wen', 'fu xi', 'gua', 'kua'];

function cardsFor(polarityBits, mutantBits) {
  return LINE_ORDER.map((fam, i) => {
    const card = { family: fam, name: `carte-${fam}`, quote: '', polarity: polarityBits[i] === '1' ? 'yang' : 'yin' };
    if (mutantBits && mutantBits[i] === '1') {
      card.bridgeCard = { family: 'actions', name: `pont-${fam}`, quote: '', polarity: 'yang' };
    }
    return card;
  }).concat([{ family: 'memoire_cosmos', name: 'contexte', quote: '', polarity: null }]);
}

test('buildFractalInstruction renvoie une chaîne vide si une famille manque', () => {
  const cards = cardsFor('111111').slice(0, 5); // il manque "actions"
  assert.equal(buildFractalInstruction(cards), '');
});

test('buildFractalInstruction renvoie une chaîne vide si une polarité est invalide', () => {
  const cards = cardsFor('111111');
  cards[0].polarity = undefined;
  assert.equal(buildFractalInstruction(cards), '');
});

test('buildAnalysisPrompt reste utilisable sans contexte fractal (pas d\'erreur)', () => {
  const cards = [{ family: 'emotions', name: 'Courage', quote: '', polarity: 'yang' }];
  const prompt = buildAnalysisPrompt({ intention: 'test', cards, gender: null, lang: 'fr' });
  assert.ok(prompt.includes('Courage'));
  assert.ok(!prompt.includes('CONTEXTE INTERNE'));
});

test('exhaustif : aucune des 4096 combinaisons polarité × ligne mutante ne fuite un terme réservé', () => {
  let checked = 0;
  for (let p = 0; p < 64; p++) {
    const polarityBits = p.toString(2).padStart(6, '0');
    for (let m = 0; m < 64; m++) {
      const mutantBits = m.toString(2).padStart(6, '0');
      const cards = cardsFor(polarityBits, mutantBits);
      const instruction = buildFractalInstruction(cards);
      // Seule la partie dynamique (avant "INTERDITS ABSOLUS") est issue des données ;
      // le bloc qui suit nomme ces mêmes mots délibérément, pour les interdire en sortie.
      const dynamicPart = instruction.split('INTERDITS ABSOLUS')[0].toLowerCase();
      for (const word of FORBIDDEN) {
        assert.ok(!dynamicPart.includes(word), `terme interdit "${word}" trouvé pour polarité=${polarityBits} mutant=${mutantBits}`);
      }
      checked++;
    }
  }
  assert.equal(checked, 4096);
});

test('déduplication : une figure coïncidente (nucléaire = opposée) n\'apparaît pas deux fois', () => {
  // Figure 63 (101010) : nucléaire, opposée et retournée convergent toutes vers 64.
  const cards = cardsFor('101010');
  const instruction = buildFractalInstruction(cards);
  const occurrences = (instruction.match(/Presque au bout du chemin/g) || []).length;
  assert.equal(occurrences, 1, 'les mots-clés de la figure 64 ne doivent apparaître qu\'une seule fois');
});
