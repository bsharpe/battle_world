import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treadsFromArcade, createInput } from '../src/input.js';
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
