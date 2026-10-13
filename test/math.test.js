import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapAngle, wrapCoord, dist, bearing, mulberry32 } from '../src/math.js';
import { OBSTACLE } from '../src/config.js';
import { SHAPES } from '../src/data/rom.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('angles wrap into [-π, π)', () => {
  near(wrapAngle((3 * Math.PI) / 2), -Math.PI / 2);
  near(wrapAngle((-3 * Math.PI) / 2), Math.PI / 2);
  near(wrapAngle(0.25), 0.25);
});

test('world is a 65536-unit torus: distances take the short way across the seam', () => {
  assert.equal(wrapCoord(32768), -32768);
  assert.equal(dist(32000, 0, -32000, 0), 1536);
  near(bearing(32000, 0, -32000, 0), Math.PI / 2); // just across the seam to the east
});

test('bearing: 0 is straight ahead (+z), +π/2 is to the right (+x)', () => {
  near(bearing(0, 0, 0, 100), 0);
  near(bearing(0, 0, 100, 0), Math.PI / 2);
  near(bearing(0, 0, -100, 0), -Math.PI / 2);
});

test('seeded RNG is deterministic and in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('obstacle collision radii enclose the ROM obstacle footprints', () => {
  // Catches a wrong axis mapping in the extractor: footprints must sit inside their collision circle.
  const shapes = { 0: 'narrowPyramid', 1: 'tallBox', 12: 'widePyramid', 15: 'shortBox' };
  for (const [type, name] of Object.entries(shapes)) {
    const extent = Math.max(...SHAPES[name].verts.flatMap(([x, , z]) => [Math.abs(x), Math.abs(z)]));
    assert.ok(extent < OBSTACLE.unitRadius[type], `${name} extent ${extent} vs ${OBSTACLE.unitRadius[type]}`);
  }
});
