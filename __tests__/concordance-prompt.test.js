const test = require('node:test');
const assert = require('node:assert/strict');
const { buildConcordancePrompt, extractJson, validateResult } = require('../lib/structure/concordance-prompt.js');
const { analyserStructure } = require('../lib/structure/derivees.js');

function sampleStructure() {
  return analyserStructure({
    polarityByFamily: { emotions: 'yin', besoins: 'yang', transmutation: 'yang', archetypes: 'yin', revelations: 'yin', actions: 'yin' },
    mutantFamilies: ['archetypes', 'actions']
  });
}

test('buildConcordancePrompt nomme librement le Yi King (contexte admin, pas client)', () => {
  const prompt = buildConcordancePrompt({
    intention: 'Test',
    cartesDetail: [{ family: 'emotions', name: 'PEUR', polarity: 'yin', quote: 'x' }],
    synthese: 'Une synthèse.',
    analyseIA: 'Une analyse.',
    structure: sampleStructure()
  });
  assert.match(prompt, /Yi King/);
  assert.match(prompt, /n°46/);
});

test('buildConcordancePrompt gère proprement une figure retournée/devenir absente', () => {
  const structure = analyserStructure({
    polarityByFamily: { emotions: 'yang', besoins: 'yang', transmutation: 'yang', archetypes: 'yang', revelations: 'yang', actions: 'yang' },
    mutantFamilies: []
  });
  const prompt = buildConcordancePrompt({ intention: '', cartesDetail: [], synthese: '', analyseIA: '', structure });
  assert.match(prompt, /figure symétrique/);
  assert.match(prompt, /aucune ligne mutante/);
});

test('extractJson tolère les blocs ```json et le texte autour', () => {
  const raw = 'Voici le résultat :\n```json\n{"a":1}\n```\nMerci.';
  assert.deepEqual(extractJson(raw), { a: 1 });
});

test('validateResult rejette un objet incomplet ou mal typé', () => {
  assert.equal(validateResult(null), null);
  assert.equal(validateResult({ scores: { principale: 50 } }), null);
  assert.equal(validateResult({ scores: { principale: 50, nucleaire: 50, opposee: 50, retournee: null, devenir: null, global: 50 }, verdict: '' }), null);
});

test('validateResult accepte scores 0-100 et null pour les couches absentes', () => {
  const result = validateResult({
    scores: { principale: 80, nucleaire: 10, opposee: 60, retournee: null, devenir: null, global: 55 },
    verdict: 'Bonne cohérence globale.'
  });
  assert.deepEqual(result.scores, { principale: 80, nucleaire: 10, opposee: 60, retournee: null, devenir: null, global: 55 });
});
