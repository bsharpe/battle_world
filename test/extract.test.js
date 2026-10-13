import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListing, readShape, runAvg } from '../tools/extract-rom.mjs';

const FIXTURE = `
3894: 36 39                        .dd2    shp_v_projectile  ;$03
                   shp_v_projectile
3936: 1f                           .dd1    $1f               ;shape $03
3937: d8 ff d8 ff+                 .bulk   $d8,$ff,$d8,$ff,$d0,$ff
393d: d8 ff d8 ff+                 .bulk   $d8,$ff,$d8,$ff,$f8,$ff
3943: d8 ff 28 00+                 .bulk   $d8,$ff,$28,$00,$f8,$ff
3949: d8 ff 28 00+                 .bulk   $d8,$ff,$28,$00,$d0,$ff
394f: 50 00 00 00+                 .bulk   $50,$00,$00,$00,$e4,$ff
7478: 19 75                        .dd2    shp_c_projectile  ;$03
                   shp_c_projectile
7519: 03 e1 24 0c+                 .bulk   $03,$e1,$24,$0c,$04,$1c,$24,$14,$1c,$12,$0c,$ff
34cc: 40 80        vg_reticle1     .dd2    $8040             ;CNTR
34ce: 51 1f                        .dd2    $1f51             ;VCTR dx=+0 dy=-175 in=0
34d0: 00 00                        .dd2    $0000
34d2: 64 00                        .dd2    $0064             ;VCTR dx=+0 dy=+100 in=6
34d4: 00 60                        .dd2    $6000
34d6: 19 00                        .dd2    $0019             ;VCTR dx=-75 dy=+25 in=0
34d8: b5 1f                        .dd2    $1fb5
34da: e7 1f                        .dd2    $1fe7             ;VCTR dx=+0 dy=-25 in=6
34dc: 00 60                        .dd2    $6000
34de: 00 00                        .dd2    $0000             ;VCTR dx=+150 dy=+0 in=6
34e0: 96 60                        .dd2    $6096
34e2: 19 00                        .dd2    $0019             ;VCTR dx=+0 dy=+25 in=6
34e4: 00 60                        .dd2    $6000
34e6: 64 00                        .dd2    $0064             ;VCTR dx=+0 dy=+100 in=0
34e8: 00 00                        .dd2    $0000
34ea: 19 00                        .dd2    $0019             ;VCTR dx=+0 dy=+25 in=6
34ec: 00 60                        .dd2    $6000
34ee: 00 00                        .dd2    $0000             ;VCTR dx=-150 dy=+0 in=6
34f0: 6a 7f                        .dd2    $7f6a
34f2: e7 1f                        .dd2    $1fe7             ;VCTR dx=+0 dy=-25 in=6
34f4: 00 60                        .dd2    $6000
34f6: 19 00                        .dd2    $0019             ;VCTR dx=+75 dy=+25 in=0
34f8: 4b 00                        .dd2    $004b
34fa: 64 00                        .dd2    $0064             ;VCTR dx=+0 dy=+100 in=6
34fc: 00 60                        .dd2    $6000
34fe: 00 c0                        .dd2    $c000             ;VRTS
6da3: 55 6e                        .dd2    L6E55             ;-440,+360 'ENEMY IN RANGE'
`;

test('projectile shape decodes to a 5-vertex dart with 8 edges', () => {
  const { mem } = parseListing(FIXTURE);
  const shell = readShape(mem, 3);
  // ROM order is (forward, right, up) with right mirrored; engine order is (right, up, forward).
  assert.deepEqual(shell.verts, [[40, -48, -40], [40, -8, -40], [-40, -8, -40], [-40, -48, -40], [0, -28, 80]]);
  assert.deepEqual(shell.segs, [[0, 4, 28], [4, 1, 28], [1, 0, 28], [0, 3, 28], [3, 4, 28], [4, 2, 28], [2, 3, 28], [2, 1, 28]]);
});

test('reticle AVG routine yields the 8 visible strokes, invisible moves skipped', () => {
  const { avg } = parseListing(FIXTURE);
  const { segs } = runAvg(avg, 0x34cc);
  assert.equal(segs.length, 8);
  assert.deepEqual(segs[0], [0, -175, 0, -75, 6]);
  assert.deepEqual(segs[7], [0, 75, 0, 175, 6]);
});

test('string table positions are captured only inside the English table', () => {
  const withTable = `                   str_addr_en\n${FIXTURE}\n                   str_addr_fr\n`;
  assert.deepEqual(parseListing(withTable).strings, [{ x: -440, y: 360, text: 'ENEMY IN RANGE' }]);
  assert.deepEqual(parseListing(FIXTURE).strings, []);
});

import { SHAPES, OBSTACLES, GLYPHS, VG, STRINGS } from '../src/data/rom.js';

test('generated ROM data has the arcade inventory', () => {
  assert.equal(SHAPES.tank.verts.length, 24);
  assert.equal(OBSTACLES.length, 21);
  assert.deepEqual(OBSTACLES[0], { type: 12, facing: 0, x: 8192, z: 8192 });
  assert.ok(OBSTACLES.every((o) => [0, 1, 12, 15].includes(o.type)));
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ') assert.ok(GLYPHS[ch], `glyph ${ch}`);
  assert.equal(VG.landscape.length, 8);
  assert.ok(VG.cracks.length > 0);
  for (const n of ['10', '11', '12', '13', '14', '15', '18', '19', '1a', '1b', '1c', '1d']) assert.ok(SHAPES[`chunk${n}`], `debris chunk${n}`);
  assert.deepEqual(STRINGS.find((s) => s.text === 'ENEMY IN RANGE'), { x: -440, y: 360, text: 'ENEMY IN RANGE' });
});
