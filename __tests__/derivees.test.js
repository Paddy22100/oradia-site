// __tests__/derivees.test.js
// Vérifie la cohérence interne de la table (data/figures.json) et du module de calcul
// (lib/structure/derivees.js) — pas une fidélité à un enseignement traditionnel.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { figures } = require('../data/figures.json');
const {
  LINE_ORDER,
  binaryFromPolarities,
  lookupFigure,
  invertAll,
  reverseLines,
  nuclearBinary,
  analyserStructure,
} = require('../lib/structure/derivees.js');

test('la table contient exactement 64 figures, numéros et structures distincts', () => {
  assert.equal(figures.length, 64);
  const numeros = new Set(figures.map(f => f.numero));
  const binaires = new Set(figures.map(f => f.binaire));
  assert.equal(numeros.size, 64);
  assert.equal(binaires.size, 64);
  for (let i = 1; i <= 64; i++) assert.ok(numeros.has(i), `numéro ${i} manquant`);
  for (const f of figures) assert.match(f.binaire, /^[01]{6}$/, `binaire invalide pour #${f.numero}`);
});

test('figure 1 = 6 traits Yang, figure 2 = 6 traits Yin', () => {
  assert.equal(lookupFigure('111111').numero, 1);
  assert.equal(lookupFigure('000000').numero, 2);
});

test('figure 11 : trigramme bas Ciel (111) + trigramme haut Terre (000)', () => {
  const f11 = figures.find(f => f.numero === 11);
  assert.equal(f11.binaire, '111000');
});

test('figures 63 et 64 bien identifiées (alternance inverse l\'une de l\'autre)', () => {
  const f63 = figures.find(f => f.numero === 63);
  const f64 = figures.find(f => f.numero === 64);
  assert.equal(f63.binaire, '101010');
  assert.equal(f64.binaire, '010101');
});

test('nucléaire de 1 est 1, nucléaire de 2 est 2', () => {
  assert.equal(lookupFigure(nuclearBinary('111111')).numero, 1);
  assert.equal(lookupFigure(nuclearBinary('000000')).numero, 2);
});

test('nucléaire de 63 est 64, et réciproquement', () => {
  const nucDe63 = nuclearBinary('101010');
  const nucDe64 = nuclearBinary('010101');
  assert.equal(lookupFigure(nucDe63).numero, 64);
  assert.equal(lookupFigure(nucDe64).numero, 63);
});

test('opposée de l\'opposée redonne la figure de départ', () => {
  for (const f of figures) {
    assert.equal(invertAll(invertAll(f.binaire)), f.binaire);
  }
});

test('retournée de la retournée redonne la figure de départ', () => {
  for (const f of figures) {
    assert.equal(reverseLines(reverseLines(f.binaire)), f.binaire);
  }
});

test('les 8 figures symétriques (1,2,27,28,29,30,61,62) ont une retournée identique à elles-mêmes', () => {
  const symetriques = [1, 2, 27, 28, 29, 30, 61, 62];
  for (const n of symetriques) {
    const f = figures.find(x => x.numero === n);
    assert.equal(reverseLines(f.binaire), f.binaire, `figure ${n} devrait être symétrique`);
  }
  // Et aucune figure en dehors de cette liste ne doit l'être (sinon la liste est incomplète).
  for (const f of figures) {
    const isSym = reverseLines(f.binaire) === f.binaire;
    assert.equal(isSym, symetriques.includes(f.numero), `symétrie inattendue pour la figure ${f.numero}`);
  }
});

test('binaryFromPolarities respecte l\'ordre famille → ligne validé', () => {
  assert.deepEqual(LINE_ORDER, ['emotions', 'besoins', 'transmutation', 'archetypes', 'revelations', 'actions']);
  const allYang = Object.fromEntries(LINE_ORDER.map(f => [f, 'yang']));
  assert.equal(binaryFromPolarities(allYang), '111111');
  const allYin = Object.fromEntries(LINE_ORDER.map(f => [f, 'yin']));
  assert.equal(binaryFromPolarities(allYin), '000000');
  // Émotions=ligne1 doit rester le bit le plus à gauche.
  const emotionsYangSeul = { ...allYin, emotions: 'yang' };
  assert.equal(binaryFromPolarities(emotionsYangSeul), '100000');
  const actionsYangSeul = { ...allYin, actions: 'yang' };
  assert.equal(binaryFromPolarities(actionsYangSeul), '000001');
});

test('analyserStructure : sans ligne mutante, devenir est null', () => {
  const allYang = Object.fromEntries(LINE_ORDER.map(f => [f, 'yang']));
  const res = analyserStructure({ polarityByFamily: allYang, mutantFamilies: [] });
  assert.equal(res.principale.numero, 1);
  assert.equal(res.devenir, null);
  assert.deepEqual(res.lignesMutantes, []);
});

test('analyserStructure : une ligne mutante inverse uniquement cette ligne pour le devenir', () => {
  const allYang = Object.fromEntries(LINE_ORDER.map(f => [f, 'yang']));
  const res = analyserStructure({ polarityByFamily: allYang, mutantFamilies: ['besoins'] });
  assert.deepEqual(res.lignesMutantes, [2]);
  assert.equal(res.devenir.binaire, '101111');
});

test('analyserStructure : figure retournée null si symétrique à la principale', () => {
  const allYang = Object.fromEntries(LINE_ORDER.map(f => [f, 'yang']));
  const res = analyserStructure({ polarityByFamily: allYang, mutantFamilies: [] });
  assert.equal(res.retournee, null); // figure 1 est symétrique
});

test('analyserStructure : correspondances résonance/blocage sur les paires 1-4, 2-5, 3-6', () => {
  // emotions(1)=yang, archetypes(4)=yin -> résonance ; besoins(2)=yang, revelations(5)=yang -> blocage ;
  // transmutation(3)=yin, actions(6)=yang -> résonance
  const polarities = {
    emotions: 'yang', besoins: 'yang', transmutation: 'yin',
    archetypes: 'yin', revelations: 'yang', actions: 'yang',
  };
  const res = analyserStructure({ polarityByFamily: polarities, mutantFamilies: [] });
  const byLignes = Object.fromEntries(res.correspondances.map(c => [c.lignes.join('-'), c.etat]));
  assert.equal(byLignes['1-4'], 'resonance');
  assert.equal(byLignes['2-5'], 'blocage');
  assert.equal(byLignes['3-6'], 'resonance');
});
