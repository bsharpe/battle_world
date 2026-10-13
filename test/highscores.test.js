import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCORES, rankFor, insertScore, loadScores, saveScores, editInitials } from '../src/highscores.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
const entry = () => ({ letters: [0, 0, 0], pos: 0, armed: true });
const idle = { left: 0, right: 0, fire: false, start: false, typed: '' };

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

test('typed letters spell the initials; the third letter accepts the name', () => {
  const e = entry();
  assert.equal(editInitials(e, { ...idle, typed: 'B' }, LETTERS), false);
  assert.equal(editInitials(e, { ...idle, typed: 'E' }, LETTERS), false);
  assert.equal(editInitials(e, { ...idle, typed: 'N' }, LETTERS), true);
  assert.equal(e.letters.map((i) => LETTERS[i]).join(''), 'BEN');
});

test('backspace steps back a letter, and a held turn key does not also spin it', () => {
  const e = entry();
  editInitials(e, { ...idle, typed: 'B' }, LETTERS);
  editInitials(e, { ...idle, typed: '\b' }, LETTERS);
  assert.equal(e.pos, 0);
  assert.equal(editInitials(e, { ...idle, typed: 'D', left: 0, right: 1 }, LETTERS), false);
  assert.equal(LETTERS[e.letters[0]], 'D');
  assert.equal(e.pos, 1);
  assert.equal(LETTERS[e.letters[1]], 'A');
});

test('arrows still change the current letter one step per press, fire accepts it', () => {
  const e = entry();
  assert.equal(editInitials(e, { ...idle, left: 1, right: -1 }, LETTERS), false);
  assert.equal(LETTERS[e.letters[0]], 'B');
  assert.equal(editInitials(e, { ...idle, left: 1, right: -1 }, LETTERS), false);
  assert.equal(LETTERS[e.letters[0]], 'B');
  editInitials(e, idle, LETTERS);
  assert.equal(editInitials(e, { ...idle, fire: true }, LETTERS), false);
  assert.equal(e.pos, 1);
});

test('blocked or corrupt storage falls back to defaults without throwing', () => {
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.deepEqual(loadScores(blocked), DEFAULT_SCORES);
  assert.doesNotThrow(() => saveScores(DEFAULT_SCORES, blocked));
  assert.deepEqual(loadScores({ getItem: () => '{not json' }), DEFAULT_SCORES);
  assert.deepEqual(loadScores(undefined), DEFAULT_SCORES);
});
