import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radarBlip, enemyDirection, enemyInRange, onTarget, sweepCrossed, drawHud, drawText, drawTitle, drawAttractText, drawModeBanner, glassWeb } from '../src/render/hud.js';
import { VIEW } from '../src/config.js';
import { STRINGS, VG } from '../src/data/rom.js';

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

test('a radar blip is a point on the dot channel, not a thin HUD stroke', () => {
  const thin = [], dots = [];
  const buf = {
    push: (...seg) => thin.push(seg),
    pushText: (...seg) => thin.push(seg),
    pushDot: (...seg) => dots.push(seg),
  };
  drawHud(buf, {
    score: 0, lives: 0, blockedFor: 0, over: false,
    enemy: { y: 0 }, player: { alive: true, deadFor: 0 },
  }, { sweep: Math.PI, blip: [0, 12], blipGlow: 0 }, 0, 0);
  assert.equal(dots.length, 1);
  const [x0, y0, x1, y1, i] = dots[0];
  assert.equal(x0, x1);
  assert.equal(y0, y1);
  assert.ok(Math.abs(i - 4 / 12) < 1e-6, `resting blip intensity ${i}`);
  assert.equal(thin.some((s) => s[0] === x0 && s[1] === y0 && s[2] === x0 && s[3] === y0), false);
});

test('GAME OVER is twice the size of the other HUD messages', () => {
  // HUD copy is the ROM half-size (glyph height 12). Game over is the full 24-unit glyph.
  const lines = [];
  const buf = { push() {}, pushText: (...seg) => lines.push(seg) };
  drawHud(buf, {
    score: 0, lives: 0, blockedFor: 0, over: true, enemy: null,
    player: { alive: false, deadFor: 1 },
  }, { sweep: 0, blip: null, blipGlow: 0 }, 0, 0);
  const entry = STRINGS.find((e) => e.text === 'GAME OVER');
  const S = VIEW.height / 768, CX = VIEW.width / 2, CY = VIEW.height / 2;
  let minY = Infinity, maxY = -Infinity, maxX = -Infinity;
  for (const [x0, y0, x1, y1] of lines) {
    for (const [sx, sy] of [[x0, y0], [x1, y1]]) {
      const ax = (sx - CX) / S, ay = (CY - sy) / S;
      if (ax < entry.x - 1 || ay < entry.y - 1 || ay > entry.y + 30) continue;
      minY = Math.min(minY, ay);
      maxY = Math.max(maxY, ay);
      maxX = Math.max(maxX, ax);
    }
  }
  assert.ok(Math.abs(maxY - minY - 24) < 0.5, `height ${maxY - minY}`);
  assert.ok(Math.abs(maxX - entry.x - (8 * 24 + 16)) < 0.5, `reach ${maxX - entry.x}`);
});

test('the attract title reads BATTLE WORLD in the game font', () => {
  // The Atari logotype spelled BATTLE ZONE. The wordmark is two centered game-font lines in that top band.
  const scale = 3, gap = 10, top = 40;
  const S = VIEW.height / 768;
  const oy1 = (VIEW.height / 2 - top) / S - 24 * scale;
  const oy2 = oy1 - 24 * scale - gap;
  const lineX = (text) => -((text.length - 1) * 24 + 16) * scale / 2;
  const expect = [];
  const exp = { push() {}, pushText: (...seg) => expect.push(seg) };
  drawText(exp, 'BATTLE', lineX('BATTLE'), oy1, 1, scale);
  drawText(exp, 'WORLD', lineX('WORLD'), oy2, 1, scale);
  const lines = [];
  drawTitle({ push() {}, pushText: (...seg) => lines.push(seg) });
  assert.deepEqual(lines, expect);
  const CX = VIEW.width / 2;
  const xs = lines.flatMap(([x0, , x1]) => [x0, x1]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  assert.ok(Math.abs(mid - CX) < 1, `title is off center by ${mid - CX}`);
});

test('PRESS START and the bonus and controls lines on the title page are centered on screen', () => {
  // The ROM placed BONUS TANK left of center; the controls hang under it, so the whole block read lopsided.
  const lines = [];
  drawAttractText({ push() {}, pushText: (...seg) => lines.push(seg) }, 0, []);
  const S = VIEW.height / 768, CX = VIEW.width / 2, CY = VIEW.height / 2;
  const rows = [[-202, -186], [-282, -260], [-318, -298], [-342, -322]].map(([lo, hi]) => {
    const xs = lines.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x1, y1]])
      .filter(([, sy]) => { const ay = (CY - sy) / S; return ay >= lo && ay <= hi; })
      .map(([sx]) => (sx - CX) / S);
    return xs;
  });
  rows.forEach((xs, i) => {
    assert.ok(xs.length > 0, `row ${i} drew nothing`);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    assert.ok(Math.abs(mid) < 8, `row ${i} is off center by ${mid}`);
  });
});

test('the high scores screen is centered on screen', () => {
  // Seven-digit scores fill the padded field, so ink width equals layout width.
  const lines = [];
  drawAttractText({ push() {}, pushText: (...seg) => lines.push(seg) }, 6, [
    { score: 1234567, initials: 'ABC' }, { score: 7654321, initials: 'XYZ' },
  ]);
  const S = VIEW.height / 768, CX = VIEW.width / 2, CY = VIEW.height / 2;
  [[158, 174], [118, 134], [98, 114]].forEach(([lo, hi], i) => {
    const xs = lines.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x1, y1]])
      .filter(([, sy]) => { const ay = (CY - sy) / S; return ay >= lo && ay <= hi; })
      .map(([sx]) => (sx - CX) / S);
    assert.ok(xs.length > 0, `row ${i} drew nothing`);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    assert.ok(Math.abs(mid) < 8, `row ${i} is off center by ${mid}`);
  });
});

test('the title page does not draw the Atari copyright line', () => {
  const copy = STRINGS.find((e) => e.text.includes('ATARI'));
  const copyright = [];
  drawText({ push() {}, pushText: (...seg) => copyright.push(seg.join(',')) }, copy.text, copy.x, copy.y);
  for (const t of [0, 6]) {
    const lines = [];
    drawAttractText({ push() {}, pushText: (...seg) => lines.push(seg.join(',')) }, t, []);
    assert.ok(copyright.every((seg) => !lines.includes(seg)), 'the Atari copyright line is still on the title page');
  }
});

test('drawHud score text matches the ROM field length', () => {
  const lines = [];
  const buf = { push: (...seg) => lines.push(seg), pushText: (...seg) => lines.push(seg) };
  drawHud(buf, {
    score: 9000, lives: 0, blockedFor: 0, over: false, enemy: null,
    player: { alive: true, deadFor: 0 },
  }, { sweep: 0, blip: null, blipGlow: 0 }, 9000, 0);
  const score = STRINGS.find((e) => e.text.startsWith('SCORE') && !e.text.startsWith('HIGH'));
  const high = STRINGS.find((e) => e.text.startsWith('HIGH SCORE '));
  assert.equal(drawnTextLength(lines, score), score.text.length);
  assert.equal(drawnTextLength(lines, high), high.text.length);
});

test('disco glass rings start and end on a crack or spoke, so no ring floats loose', () => {
  // A spiderweb fracture is rings strung between the radial cracks. A ring end
  // that misses every crack reads as a scratch on the glass, not a break in it.
  const onSeg = (x, y, [x0, y0, x1, y1]) => {
    const dx = x1 - x0, dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) < 1;
  };
  for (const seed of [1, 2, 3]) {
    const { spokes, rings } = glassWeb(seed);
    const cracks = [...VG.cracks.flat(), ...spokes];
    const onCrack = (x, y) => cracks.some((s) => onSeg(x, y, s));
    assert.ok(rings.length > 0, `seed ${seed} strung no rings`);
    for (const [ax, ay, , , bx, by] of rings) {
      assert.ok(onCrack(ax, ay) && onCrack(bx, by), `ring chord (${ax},${ay})-(${bx},${by}) floats off the cracks`);
    }
  }
});

test('switching color mode names the new mode on screen, then clears it', () => {
  // C cycles three looks. The banner tells players which one they landed on, then gets out of the way.
  // Shapes are compared with position and size factored out, so only the spelling counts.
  const shape = (draw) => {
    const segs = [];
    draw({ push() {}, pushText: (...s) => segs.push(s) });
    const pts = segs.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x1, y1]]);
    const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
    const h = Math.max(...pts.map((p) => p[1])) - minY;
    return segs.map((s) => s.slice(0, 4).map((v, i) => ((v - (i % 2 ? minY : minX)) / h).toFixed(3)).join()).sort();
  };
  for (const [mode, name] of [['green', 'ORIGINAL MODE'], ['amber', 'AMBER MODE'], ['disco', 'DISCO MODE']]) {
    assert.deepEqual(shape((b) => drawModeBanner(b, mode, 0)), shape((b) => drawText(b, name, 0, 0)), `${mode} banner`);
  }
  const late = [];
  drawModeBanner({ push() {}, pushText: (...s) => late.push(s) }, 'disco', 5);
  assert.equal(late.length, 0, 'the banner is gone a few seconds after the switch');
});
