import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/game.js';
import { mulberry32 } from '../src/math.js';
import { PLAYER } from '../src/config.js';

const IDLE = { left: 0, right: 0, fire: false };
const FORWARD = { left: 1, right: 1, fire: false };
function run(g, input, seconds, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) events.push(...step(g, input, dt));
  return events;
}
const quiet = (opts = {}) => {
  const g = createGame({ rng: mulberry32(7), obstacles: [], ...opts });
  g.enemyDelay = Infinity; // keep enemies out of movement tests
  return g;
};

test('both treads forward drives straight ahead at full speed', () => {
  const g = quiet();
  run(g, FORWARD, 1);
  assert.ok(Math.abs(g.player.z - PLAYER.speed) < 1);
  assert.ok(Math.abs(g.player.x) < 1e-6);
});

test('left tread forward, right tread back pivots right in place', () => {
  const g = quiet();
  run(g, { left: 1, right: -1, fire: false }, 1);
  assert.ok(Math.abs(g.player.facing - PLAYER.turnRate) < 1e-6);
  assert.equal(g.player.x, 0);
  assert.equal(g.player.z, 0);
});

test('one tread alone moves at half speed while turning at half rate', () => {
  const g = quiet();
  run(g, { left: 1, right: 0, fire: false }, 0.5);
  assert.ok(Math.abs(g.player.facing - PLAYER.turnRate * 0.25) < 1e-6);
  assert.ok(g.player.z > 0 && g.player.z < PLAYER.speed * 0.5);
});

test('driving into an obstacle stops the tank and reports it once', () => {
  const g = quiet({ obstacles: [{ type: 1, x: 0, z: 1500, facing: 0 }] });
  const events = run(g, FORWARD, 1);
  assert.ok(g.player.z < 1500 - 832, 'never enters the obstacle radius');
  assert.equal(events.filter((e) => e.type === 'blocked').length, 1);
  assert.ok(g.blockedFor > 0);
});

test('driving off the world edge wraps to the other side', () => {
  const g = quiet();
  g.player.z = 32700;
  run(g, FORWARD, 0.1);
  assert.ok(g.player.z < -32000);
});

test('a huge frame time (tab was hidden) is clamped, not applied', () => {
  const g = quiet();
  step(g, FORWARD, 10);
  assert.ok(g.player.z <= PLAYER.speed * 0.05 + 1e-6);
});
