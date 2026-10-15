import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { makeEnemy, chooseKind, spawnEnemy, updateEnemy, updateSaucer } from '../src/ai.js';
import { mulberry32, bearing, dist, wrapAngle } from '../src/math.js';
import { ENEMY } from '../src/config.js';

const game = (seed = 1, obstacles = []) => createGame({ rng: mulberry32(seed), obstacles });
const tick = (g, e, seconds, dt = 0.05) => {
  const out = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) out.push(updateEnemy(g, e, dt));
  return out;
};

test('only slow tanks before the missile score', () => {
  const g = game();
  g.score = 9000;
  for (let i = 0; i < 200; i++) assert.equal(chooseKind(g), 'tank');
});

test('about half of spawns are missiles once the missile score is reached', () => {
  const g = game();
  g.score = 10000;
  let missiles = 0;
  for (let i = 0; i < 1000; i++) {
    g.missilesLaunched = 0;
    if (chooseKind(g) === 'missile') missiles++;
  }
  assert.ok(missiles > 400 && missiles < 600, `${missiles}`);
});

test('ground units become super tanks after the 6th missile launch', () => {
  const g = game();
  g.missilesLaunched = 6;
  assert.equal(chooseKind(g), 'super');
});

test('after the player dies the next spawn is a ground unit', () => {
  const g = game();
  g.score = 50000;
  g.forceGround = true;
  assert.notEqual(spawnEnemy(g).kind, 'missile');
  assert.equal(g.forceGround, false);
});

test('early spawns appear ahead of the player within ±15 A at full or half distance', () => {
  const g = game();
  for (let i = 0; i < 100; i++) {
    const e = spawnEnemy(g);
    const off = wrapAngle(bearing(0, 0, e.x, e.z) - g.player.facing);
    assert.ok(Math.abs(off) <= ENEMY.spawnSpreadNarrow + 1e-9);
    const d = dist(0, 0, e.x, e.z);
    assert.ok(Math.abs(d - ENEMY.spawnDist) < 1 || Math.abs(d - ENEMY.spawnDist / 2) < 1, `${d}`);
  }
});

test('a tank never spawns inside an obstacle', () => {
  const g = game(3, [{ type: 12, x: 0, z: ENEMY.spawnDist, facing: 0 }, { type: 12, x: 0, z: ENEMY.spawnDist / 2, facing: 0 }]);
  for (let i = 0; i < 100; i++) {
    const e = spawnEnemy(g);
    assert.ok(dist(e.x, e.z, 0, ENEMY.spawnDist) >= 1024 && dist(e.x, e.z, 0, ENEMY.spawnDist / 2) >= 1024);
  }
});

test('a tank holds fire for 2 s after spawning even when aimed', () => {
  const g = game();
  g.score = 2000;
  const e = makeEnemy('tank', 0, 5000, Math.PI);
  e.aimTimer = 100;
  const shots = tick(g, e, 3).map((r) => r.fire);
  assert.ok(shots.slice(0, 39).every((f) => !f), 'silent before 2 s');
  assert.ok(shots.slice(41).some((f) => f), 'fires after 2 s');
});

test('a tank never fires when its barrel is not on the player', () => {
  const g = game();
  g.score = 50000;
  const e = makeEnemy('tank', 0, 5000, 0);
  e.age = 20;
  e.aimTimer = 100;
  e.goal = 0;
  assert.ok(tick(g, e, 1).every((r) => !r.fire));
});

test('a tank halts at its stand-off distance instead of ramming', () => {
  const g = game();
  const e = makeEnemy('tank', 0, 1200, Math.PI);
  e.aimTimer = 100;
  tick(g, e, 1);
  assert.equal(e.z, 1200);
});

test('a tank that bumps an obstacle backs off', () => {
  const g = game(1, [{ type: 1, x: 0, z: 3000, facing: 0 }]);
  const e = makeEnemy('tank', 0, 3850, Math.PI);
  e.aimTimer = 100;
  updateEnemy(g, e, 0.1);
  assert.equal(e.z, 3850);
  assert.ok(e.reverseFor > 0);
});

test('a missile drops from the sky to the ground in about 1.5 s', () => {
  const g = game();
  const e = makeEnemy('missile', 0, 24000, Math.PI);
  assert.equal(e.y, ENEMY.missile.spawnAlt);
  tick(g, e, 1.6);
  assert.equal(e.y, 0);
});

test('the first missile flies straight at the player; later ones zigzag', () => {
  const g = game();
  const straight = makeEnemy('missile', 5000, 20000, 0);
  straight.straight = true;
  const before = bearing(5000, 20000, 0, 0);
  updateEnemy(g, straight, 0.05);
  assert.ok(Math.abs(wrapAngle(straight.facing - before)) < 1e-9);

  const zig = makeEnemy('missile', 0, 24000, Math.PI);
  let maxOff = 0;
  for (let i = 0; i < 20; i++) {
    const want = bearing(zig.x, zig.z, 0, 0);
    updateEnemy(g, zig, 0.05);
    maxOff = Math.max(maxOff, Math.abs(wrapAngle(zig.facing - want)));
  }
  assert.ok(maxOff > 0.3, `${maxOff}`);
});

test('no saucer below 2000 points; one arrives within 16 s after', () => {
  const g = game();
  g.score = 1999;
  for (let i = 0; i < 1000; i++) updateSaucer(g, 0.1);
  assert.equal(g.saucers.length, 0);
  g.score = 2000;
  for (let i = 0; i < 161 && !g.saucers.length; i++) updateSaucer(g, 0.1);
  assert.equal(g.saucers.length, 1);
});

test('the arcade saucer waits for an empty sky', () => {
  // The ROM flies one saucer at a time. Saucers called in with the U key are
  // extras; they must not make the arcade one arrive alongside them.
  const g = game();
  g.score = 2000;
  g.saucers = [{ x: 0, z: 9000, y: 0, vx: 0, vz: 0, retarget: 100, spin: 0 }];
  for (let i = 0; i < 300; i++) updateSaucer(g, 0.1);
  assert.equal(g.saucers.length, 1);
});
