import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radarBlip, enemyDirection, enemyInRange, onTarget, sweepCrossed, drawHud } from '../src/render/hud.js';
import { VIEW } from '../src/config.js';
import { STRINGS } from '../src/data/rom.js';

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

// Half-size glyphs advance 12 AVG units. Digit cells are 8 wide, so the field length is the right edge of the last glyph.
function drawnTextLength(lines, entry) {
  const S = VIEW.height / 768, CX = VIEW.width / 2, CY = VIEW.height / 2;
  let maxX = -Infinity;
  for (const [x0, y0, x1, y1] of lines) {
    for (const [sx, sy] of [[x0, y0], [x1, y1]]) {
      const ax = (sx - CX) / S, ay = (CY - sy) / S;
      if (ay >= entry.y - 0.5 && ay <= entry.y + 12.5 && ax >= entry.x - 1) maxX = Math.max(maxX, ax);
    }
  }
  return Math.round((maxX - entry.x - 8) / 12 + 1);
}

test('drawHud score text matches the ROM field length', () => {
  const lines = [];
  const buf = { push: (...seg) => lines.push(seg) };
  drawHud(buf, {
    score: 9000, lives: 0, blockedFor: 0, over: false, enemy: null,
    player: { alive: true, deadFor: 0 },
  }, { sweep: 0, blip: null, blipGlow: 0 }, 9000, 0);
  const score = STRINGS.find((e) => e.text.startsWith('SCORE') && !e.text.startsWith('HIGH'));
  const high = STRINGS.find((e) => e.text.startsWith('HIGH SCORE '));
  assert.equal(drawnTextLength(lines, score), score.text.length);
  assert.equal(drawnTextLength(lines, high), high.text.length);
});
