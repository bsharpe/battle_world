import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCORES, rankFor, insertScore, loadScores, saveScores } from '../src/highscores.js';

test('the arcade table starts as ten 5,000-point entries', () => {
  assert.equal(DEFAULT_SCORES.length, 10);
  assert.ok(DEFAULT_SCORES.every((e) => e.score === 5000));
  assert.equal(DEFAULT_SCORES[0].initials, 'EDR');
});

test('a score must beat an entry to rank; ties do not displace older scores', () => {
  assert.equal(rankFor(DEFAULT_SCORES, 6000), 0);
  assert.equal(rankFor(DEFAULT_SCORES, 5000), -1);
  assert.equal(rankFor(DEFAULT_SCORES, 0), -1);
});

test('inserting keeps the table sorted and at ten entries', () => {
  const t = insertScore(DEFAULT_SCORES, 12000, 'BEN');
  assert.equal(t.length, 10);
  assert.deepEqual(t[0], { score: 12000, initials: 'BEN' });
  assert.equal(t[9].initials, 'ORR');
});

test('scores survive a save/load round trip', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const t = insertScore(DEFAULT_SCORES, 12000, 'BEN');
  saveScores(t, storage);
  assert.deepEqual(loadScores(storage), t);
});

test('blocked or corrupt storage falls back to defaults without throwing', () => {
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.deepEqual(loadScores(blocked), DEFAULT_SCORES);
  assert.doesNotThrow(() => saveScores(DEFAULT_SCORES, blocked));
  assert.deepEqual(loadScores({ getItem: () => '{not json' }), DEFAULT_SCORES);
  assert.deepEqual(loadScores(undefined), DEFAULT_SCORES);
});
