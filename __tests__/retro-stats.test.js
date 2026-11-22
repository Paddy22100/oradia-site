const test = require('node:test');
const assert = require('node:assert/strict');
const { arm, concurrencyLabels, resonanceLabels, statsByLabel, twoSidedP } = require('../lib/retro-stats.js');

test('arm renvoie n=0 et des valeurs nulles sans données valides', () => {
  const a = arm([], 'past_bit');
  assert.equal(a.n, 0);
  assert.equal(a.rate, null);
  assert.equal(a.significant, false);
});

test('arm calcule un taux de correspondance de 100% quand tout concorde (baseline neutralisée)', () => {
  const rows = [
    { present_bit: 1, past_bit: 1 }, { present_bit: 0, past_bit: 0 },
    { present_bit: 1, past_bit: 1 }, { present_bit: 0, past_bit: 0 }
  ];
  const a = arm(rows, 'past_bit');
  assert.equal(a.n, 4);
  assert.equal(a.rate, 1);
  assert.ok(a.z > 0);
});

test('arm ignore les lignes où present_bit ou la clé comparée sont absents', () => {
  const rows = [{ present_bit: 1, past_bit: 1 }, { present_bit: 1, past_bit: null }, { present_bit: null, past_bit: 1 }];
  const a = arm(rows, 'past_bit');
  assert.equal(a.n, 1);
});

test('twoSidedP(0) vaut 1 (aucun écart au hasard)', () => {
  assert.ok(Math.abs(twoSidedP(0) - 1) < 1e-6);
});

test('concurrencyLabels marque "solo" une session isolée dans le temps', () => {
  const rows = [
    { id: 1, intention_at: '2026-11-22T10:00:00Z' },
    { id: 2, intention_at: '2026-11-22T12:00:00Z' } // 2h plus tard : hors fenêtre 10 min
  ];
  const labels = concurrencyLabels(rows, 10);
  assert.equal(labels.get(1), 'solo');
  assert.equal(labels.get(2), 'solo');
});

test('concurrencyLabels marque "accompagne" deux sessions proches dans le temps', () => {
  const rows = [
    { id: 1, intention_at: '2026-11-22T10:00:00Z' },
    { id: 2, intention_at: '2026-11-22T10:03:00Z' } // 3 min plus tard : dans la fenêtre 10 min
  ];
  const labels = concurrencyLabels(rows, 10);
  assert.equal(labels.get(1), 'accompagne');
  assert.equal(labels.get(2), 'accompagne');
});

test('concurrencyLabels gère les horodatages invalides sans planter', () => {
  const rows = [{ id: 1, intention_at: 'pas une date' }, { id: 2, intention_at: '2026-11-22T10:00:00Z' }];
  const labels = concurrencyLabels(rows, 10);
  assert.equal(labels.has(1), false);
  assert.equal(labels.get(2), 'solo');
});

test('resonanceLabels relie une retro_session à sa fenêtre puis à sa réponse de résonance', () => {
  const rows = [{ id: 1, session_id: 'sid_a' }, { id: 2, session_id: 'sid_b' }, { id: 3, session_id: 'sid_c' }];
  const windows = [{ id: 'w1', session_id: 'sid_a' }, { id: 'w2', session_id: 'sid_b' }];
  const responses = [{ observation_window_id: 'w1', resonance_tirage: 'fort' }, { observation_window_id: 'w2', resonance_tirage: 'non' }];
  const labels = resonanceLabels(rows, windows, responses);
  assert.equal(labels.get(1), 'forte');
  assert.equal(labels.get(2), 'faible');
  assert.equal(labels.has(3), false); // pas de fenêtre pour cette session
});

test('resonanceLabels laisse une session sans réponse de questionnaire hors segmentation', () => {
  const rows = [{ id: 1, session_id: 'sid_a' }];
  const windows = [{ id: 'w1', session_id: 'sid_a' }];
  const labels = resonanceLabels(rows, windows, []);
  assert.equal(labels.has(1), false);
});

test('statsByLabel regroupe par label et calcule un arm par groupe, groupes vides inclus à n=0', () => {
  const rows = [
    { id: 1, present_bit: 1, past_bit: 1 },
    { id: 2, present_bit: 0, past_bit: 1 }
  ];
  const labelById = new Map([[1, 'forte'], [2, 'forte']]);
  const result = statsByLabel(rows, labelById, ['forte', 'faible']);
  assert.equal(result.forte.n, 2);
  assert.equal(result.faible.n, 0);
  assert.equal(result.faible.past.n, 0);
});
