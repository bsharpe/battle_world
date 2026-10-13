import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radarBlip, enemyDirection, enemyInRange, onTarget, sweepCrossed } from '../src/render/hud.js';

const P = { x: 0, z: 0, facing: 0 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('radar plots an enemy dead ahead straight up, scaled to the radar radius', () => {
  const [x, y] = radarBlip(P, { x: 0, z: 16384 });
  near(x, 0);
  near(y, 32);
});

test('radar rotates with the player: an enemy to the east is ahead when facing east', () => {
  const [x, y] = radarBlip({ ...P, facing: Math.PI / 2 }, { x: 16384, z: 0 });
  near(x, 0);
  near(y, 32);
});

test('radar ignores enemies beyond range but sees them across the world seam', () => {
  // 33000 ahead wraps to 32536 behind, still inside the 32768 radius (brief expected null).
  const [x, y] = radarBlip(P, { x: 0, z: 33000 });
  near(x, 0);
  near(y, -32536 * 64 / 32768);
  assert.equal(radarBlip(P, { x: 24000, z: 24000 }), null);
  assert.ok(radarBlip({ ...P, x: 32000 }, { x: -32000, z: 0 }));
});

test('ENEMY TO LEFT/RIGHT/REAR thresholds', () => {
  assert.equal(enemyDirection(P, { x: 0, z: 10000 }), null);
  assert.equal(enemyDirection(P, { x: 10000, z: 10000 }), 'RIGHT');
  assert.equal(enemyDirection(P, { x: -10000, z: 10000 }), 'LEFT');
  assert.equal(enemyDirection(P, { x: 1000, z: -10000 }), 'REAR');
});

test('ENEMY IN RANGE only when the enemy is on screen and within radar range', () => {
  assert.equal(enemyInRange(P, { x: 0, z: 20000 }), true);
  assert.equal(enemyInRange(P, { x: 0, z: -20000 }), false);
  assert.equal(enemyInRange(P, { x: 20000, z: 1000 }), false);
});

test('the target reticle lights exactly when a shot fired now would pass through the enemy', () => {
  assert.equal(onTarget(P, { x: 0, z: 10000 }), true);
  assert.equal(onTarget(P, { x: 700, z: 10000 }), true);
  assert.equal(onTarget(P, { x: 900, z: 10000 }), false);
  assert.equal(onTarget(P, { x: 0, z: -10000 }), false);
});

test('a missile above the hittable altitude is not in range and not on target', () => {
  const high = { x: 0, z: 10000, y: 600 };
  assert.equal(enemyInRange(P, high), false);
  assert.equal(onTarget(P, high), false);
  assert.equal(onTarget(P, { x: 0, z: 10000, y: 0 }), true);
});

test('radar sweep crossing detection', () => {
  assert.equal(sweepCrossed(0, 0.1, 0.05), true);
  assert.equal(sweepCrossed(0, 0.1, 0.2), false);
  assert.equal(sweepCrossed(3.1, -3.1, Math.PI), true); // across the ±π seam
});
