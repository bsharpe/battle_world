import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treadsFromArcade, createInput } from '../src/input.js';
import { PHOSPHOR, nextPhosphor } from '../src/config.js';
import { createGame, step } from '../src/game.js';

function fakeWindow() {
  const handlers = {};
  return {
    addEventListener: (type, fn) => (handlers[type] = fn),
    press: (code) => handlers.keydown({ code, preventDefault() {} }),
    release: (code) => handlers.keyup({ code }),
  };
}

test('arcade keys map to tank treads', () => {
  assert.deepEqual(treadsFromArcade(1, 0), { left: 1, right: 1 });
  assert.deepEqual(treadsFromArcade(0, 1), { left: 1, right: -1 });
  assert.deepEqual(treadsFromArcade(1, 1), { left: 1, right: 0 });
  assert.deepEqual(treadsFromArcade(-1, 0), { left: -1, right: -1 });
});

test('pressing D (turn right) actually turns the tank right', () => {
  const g = createGame({ obstacles: [] });
  step(g, { ...treadsFromArcade(0, 1), fire: false }, 0.05);
  assert.ok(g.player.facing > 0);
});

test('holding fire produces one shot, not a stream', () => {
  const win = fakeWindow(), input = createInput(win);
  win.press('Space');
  assert.equal(input.read().fire, true);
  assert.equal(input.read().fire, false);
  win.release('Space');
  input.read();
  win.press('Space');
  assert.equal(input.read().fire, true);
});

test('C cycles the field phosphor once per press, green, amber, disco', () => {
  assert.equal(nextPhosphor('green'), 'amber');
  assert.equal(nextPhosphor('amber'), 'disco');
  assert.equal(nextPhosphor('disco'), 'green');
  assert.ok(PHOSPHOR.green[1] > PHOSPHOR.green[0], 'green phosphor is green');
  assert.ok(PHOSPHOR.amber[0] > PHOSPHOR.amber[1] && PHOSPHOR.amber[1] > PHOSPHOR.amber[2], 'amber phosphor is orange');
  const win = fakeWindow(), input = createInput(win);
  win.press('KeyC');
  assert.equal(input.read().color, true);
  assert.equal(input.read().color, false);
});

test('letter keys are typed once, and on the initials screen they are not control shortcuts', () => {
  const win = fakeWindow(), input = createInput(win);
  win.press('KeyB');
  assert.equal(input.read().typed, 'B');
  assert.equal(input.read().typed, '');
  win.release('KeyB');
  win.press('Space');
  win.press('Backspace');
  const row = input.read();
  assert.equal(row.typed, ' \b');
  assert.equal(row.fire, true);
  win.release('Space');
  win.release('Backspace');
  input.read();
  win.press('KeyT');
  win.press('KeyC');
  const typing = input.read({ typing: true });
  assert.equal(typing.typed, 'TC');
  assert.equal(typing.color, false);
  assert.equal(input.mode, 'arcade');
});

test('T toggles authentic tread mode where Q/L drive each tread', () => {
  const win = fakeWindow(), input = createInput(win);
  win.press('KeyT');
  input.read();
  win.release('KeyT');
  win.press('KeyQ');
  win.press('KeyL');
  const r = input.read();
  assert.equal(input.mode, 'treads');
  assert.equal(r.left, 1);
  assert.equal(r.right, -1);
});
