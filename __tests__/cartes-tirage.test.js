const test = require('node:test');
const assert = require('node:assert/strict');
const { reconstruireCartesDepuisTirage } = require('../lib/structure/cartes-tirage.js');
const { structureFromCards } = require('../lib/structure/derivees.js');

// Tirage réel (id a2028824-6fb5-4892-8f51-51d2a33e4be5, 2026-11-16) utilisé comme
// cas de régression : cartes stockées sous forme de noms seuls, ordre non conforme
// à LINE_ORDER, exactement le cas qui avait d'abord fait échouer une hypothèse
// positionnelle lors du diagnostic manuel de ce tirage.
const CARTES = ['PEUR', 'AMOUR REÇU', 'ALIGNEMENT', 'OBSERVER', "L'ALCHIMISTE", 'ORIGINE', 'POINT ZÉRO'];
const PASSERELLES = [
  { carte: 'OBSERVER', passerelle: 'ecouter' },
  { carte: "L'ALCHIMISTE", passerelle: 'se_retirer' }
];

test('retrouve la bonne famille pour chaque carte, indépendamment de l\'ordre de stockage', () => {
  const { cards, incomplete } = reconstruireCartesDepuisTirage({ cartes: CARTES, passerelles: PASSERELLES });
  assert.deepEqual(incomplete, []);
  const byName = Object.fromEntries(cards.map(c => [c.name, c]));
  assert.equal(byName['PEUR'].family, 'emotions');
  assert.equal(byName['AMOUR REÇU'].family, 'besoins');
  assert.equal(byName['ALIGNEMENT'].family, 'transmutation');
  assert.equal(byName['OBSERVER'].family, 'actions');
  assert.equal(byName["L'ALCHIMISTE"].family, 'archetypes');
  assert.equal(byName['ORIGINE'].family, 'revelations');
  assert.equal(byName['POINT ZÉRO'].family, 'memoire_cosmos');
});

test('attache les cartes passerelle comme bridgeCard sur la bonne carte mère', () => {
  const { cards } = reconstruireCartesDepuisTirage({ cartes: CARTES, passerelles: PASSERELLES });
  const byName = Object.fromEntries(cards.map(c => [c.name, c]));
  assert.ok(byName['OBSERVER'].bridgeCard);
  assert.equal(byName['OBSERVER'].bridgeCard.family, 'actions');
  assert.ok(byName["L'ALCHIMISTE"].bridgeCard);
});

test('produit un résultat exploitable par structureFromCards : figure 46, lignes mutantes 4 et 6', () => {
  const { cards } = reconstruireCartesDepuisTirage({ cartes: CARTES, passerelles: PASSERELLES });
  const structure = structureFromCards(cards);
  assert.ok(structure);
  assert.equal(structure.principale.numero, 46);
  assert.deepEqual(structure.lignesMutantes, [4, 6]);
});

test('signale les noms introuvables plutôt que de produire un résultat erroné', () => {
  const { cards, incomplete } = reconstruireCartesDepuisTirage({
    cartes: ['PEUR', 'CARTE_QUI_N_EXISTE_PLUS'],
    passerelles: []
  });
  assert.deepEqual(incomplete, ['CARTE_QUI_N_EXISTE_PLUS']);
  assert.equal(cards.length, 1);
});
