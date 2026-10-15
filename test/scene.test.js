import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/data/rom.js';
import { VIEW, MODEL_Y_SCALE, DISCO } from '../src/config.js';
import { delta } from '../src/math.js';
import { createLineBuffer, makeCamera, drawModel, drawWorld, drawBackground, worldOccluders, modelOccluders, createDisco, updateDisco } from '../src/render/scene.js';

// A segment crosses the view when it covers the full width or height and still
// meets the rectangle. A short edge that merely sits inside does not.
function spansView(x0, y0, x1, y1, w, h) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  if (!(minX < 0 && maxX > w) && !(minY < 0 && maxY > h)) return false;
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0, w - x0, y0, h - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

test('a box on the world seam does not project a segment across the view', () => {
  // The (−32768, 16384) short box straddles the torus. Wrapping each vertex
  // sends one corner +65536 away, and that edge crosses the 1920×1080 view.
  const buf = createLineBuffer();
  drawModel(buf, makeCamera(0, 0, 0), SHAPES.shortBox, -32768, 0, 16384, Math.PI / 2);
  assert.ok(buf.count > 0, 'the seam box was culled instead of drawn');
  const { width, height } = VIEW;
  for (let i = 0; i < buf.count; i++) {
    const o = i * 5;
    const x0 = buf.data[o], y0 = buf.data[o + 1], x1 = buf.data[o + 2], y1 = buf.data[o + 3];
    assert.ok(
      !spansView(x0, y0, x1, y1, width, height),
      `seam edge spans the ${width}×${height} view (${x0},${y0})-(${x1},${y1})`,
    );
  }
});

function segKeys(buf) {
  const keys = [];
  for (let i = 0; i < buf.count; i++) {
    const o = i * 5;
    keys.push(`${buf.data[o]},${buf.data[o + 1]},${buf.data[o + 2]},${buf.data[o + 3]}`);
  }
  return keys;
}

test('a tank seen across the world seam draws its near treads, not the far set', () => {
  // (20000, 20000) to the camera at (−20000, −20000) wraps to (+25536, +25536).
  // That short step is in front of a facing-0 tank, so the near meshes are
  // tread4–7. Subtracting the raw coordinates takes the long way, cos goes
  // negative, and the rear meshes (tread0–3, local z < 0) get drawn instead.
  const ex = 20000, ez = 20000, cx = -20000, cz = -20000;
  const [dx, dz] = delta(cx, cz, ex, ez);
  const cam = makeCamera(cx, cz, Math.atan2(dx, dz));
  const enemy = { kind: 'tank', x: ex, y: 0, z: ez, facing: 0, treadPhase: 0 };
  const world = createLineBuffer();
  drawWorld(world, { obstacles: [], enemy, saucers: [], shells: [], debris: [] }, cam);
  const front = createLineBuffer();
  const rear = createLineBuffer();
  drawModel(front, cam, SHAPES.tread4, ex, 0, ez, 0);
  drawModel(rear, cam, SHAPES.tread0, ex, 0, ez, 0);
  const drawn = new Set(segKeys(world));
  const frontKeys = segKeys(front);
  const rearKeys = segKeys(rear);
  assert.ok(frontKeys.length > 0 && rearKeys.length > 0, 'the seam treads were culled instead of drawn');
  const rearOnly = rearKeys.filter((k) => !frontKeys.includes(k));
  assert.ok(rearOnly.length > 0, 'rear and front treads projected to the same segments');
  assert.ok(frontKeys.every((k) => drawn.has(k)), 'the near (front) treads were not projected');
  assert.ok(rearOnly.every((k) => !drawn.has(k)), 'the far (rear) treads were projected across the seam');
});

test('a super tank does not wear the slow-tank treads', () => {
  // Rear treads sit at local z −736..−1024. superTank ends at local z −456,
  // so those meshes hang off the hull. Only kind `tank` matches the tread set.
  // Camera at the origin facing 0, enemy at z 5000 facing 0: the camera is
  // behind the tank, so the near tread mesh is tread0, not tread4.
  const cam = makeCamera(0, 0, 0);
  const x = 0, y = 0, z = 5000, facing = 0;
  const field = (kind) => ({ obstacles: [], enemy: { kind, x, y, z, facing, treadPhase: 0 }, saucers: [], shells: [], debris: [] });
  const superWorld = createLineBuffer();
  drawWorld(superWorld, field('super'), cam);
  const rear = createLineBuffer();
  const front = createLineBuffer();
  drawModel(rear, cam, SHAPES.tread0, x, y, z, facing);
  drawModel(front, cam, SHAPES.tread4, x, y, z, facing);
  const drawn = new Set(segKeys(superWorld));
  const rearKeys = segKeys(rear);
  const frontKeys = segKeys(front);
  // Hidden-line removal trims the hull, so an exact edge list is no longer the proof the hull was drawn.
  assert.ok(superWorld.count > 0, 'the super tank hull was culled instead of drawn');
  assert.ok(rearKeys.length > 0 && frontKeys.length > 0, 'the tread meshes were culled instead of drawn');
  assert.ok(rearKeys.every((k) => !drawn.has(k)) && frontKeys.every((k) => !drawn.has(k)), 'slow-tank treads were projected on the super tank');
  const tankWorld = createLineBuffer();
  drawWorld(tankWorld, field('tank'), cam);
  const tankDrawn = new Set(segKeys(tankWorld));
  assert.ok(rearKeys.every((k) => tankDrawn.has(k)), 'the slow tank lost its near treads');
});

test('volcano particles are wide bloom dots, not hairline points', () => {
  // A zero-length stroke at the line sigma is a speck. The half-res bloom only
  // spreads that speck by a few pixels, so the rocks stay invisible. The dot
  // pass is the wide gaussian the bloom blur can actually lift.
  const buf = createLineBuffer();
  drawBackground(buf, makeCamera(0, 0, 0), 0.05);
  assert.ok(buf.dotCount > 0, 'volcano particles missed the bloom dot pass');
  for (let i = 0; i < buf.count; i++) {
    const o = i * 5;
    assert.ok(
      buf.data[o] !== buf.data[o + 2] || buf.data[o + 1] !== buf.data[o + 3],
      'a volcano particle was stroked as a hairline point',
    );
  }
  for (let i = 0; i < buf.dotCount; i++) {
    const o = i * 5;
    assert.equal(buf.dots[o], buf.dots[o + 2]);
    assert.equal(buf.dots[o + 1], buf.dots[o + 3]);
    assert.ok(buf.dots[o + 4] >= 2, 'particle intensity is too low for the bloom to lift');
  }
});

function pointOnSeg(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return Math.hypot(x - x0, y - y0) < 2;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) < 2;
}

function covers(buf, x, y) {
  for (let i = 0; i < buf.count; i++) {
    const o = i * 5;
    if (pointOnSeg(x, y, buf.data[o], buf.data[o + 1], buf.data[o + 2], buf.data[o + 3])) return true;
  }
  return false;
}

// Same view transform as drawModel, so a sample point is the point the renderer stroked.
function screenOf(cam, shape, i, x, y, z, facing) {
  const [lx, ly, lz] = shape.verts[i];
  const [dx, dz] = delta(cam.x, cam.z, x, z);
  const ox = dx * cam.cos - dz * cam.sin, oz = dx * cam.sin + dz * cam.cos;
  const s = Math.sin(facing), c = Math.cos(facing);
  const lxw = lx * c + lz * s, lzw = -lx * s + lz * c;
  const vx = ox + lxw * cam.cos - lzw * cam.sin;
  const vy = y + ly * MODEL_Y_SCALE;
  const vz = oz + lxw * cam.sin + lzw * cam.cos;
  return [VIEW.width / 2 + (vx * VIEW.focal) / vz, cam.horizonY - (vy * VIEW.focal) / vz];
}

function mid(cam, shape, i, j, x, y, z, facing) {
  const a = screenOf(cam, shape, i, x, y, z, facing);
  const b = screenOf(cam, shape, j, x, y, z, facing);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

test('a box face is one mask, so the far wall is not four overlapping triangles', () => {
  // Each wall of the hull is several triangles on one plane. Head-on, a tall
  // box shows only the near wall, so that wall is one mask. Leaving the
  // triangles split is what made a battlefield take a tenth of a second to clip.
  const faces = modelOccluders(makeCamera(0, 0, 0), SHAPES.tallBox, 0, 0, 5000, 0, 'box');
  assert.equal(faces.length, 1, `the near wall exploded into ${faces.length} masks`);
});

test('a box hides the edges behind it and keeps the edges on the near side', () => {
  // Wireframe strokes cross in the middle of a box. The far bottom edge sits
  // inside the near face, so a solid box drops it. The near bottom edge is the
  // skin the camera is looking at, so it stays.
  const cam = makeCamera(0, 0, 0);
  const buf = createLineBuffer();
  drawWorld(buf, { obstacles: [{ type: 1, x: 0, z: 5000, facing: 0 }], enemy: null, saucers: [], shells: [], debris: [] }, cam);
  const near = mid(cam, SHAPES.tallBox, 0, 1, 0, 0, 5000, 0);
  const far = mid(cam, SHAPES.tallBox, 2, 3, 0, 0, 5000, 0);
  assert.ok(covers(buf, near[0], near[1]), 'the near face was clipped away with the far side');
  assert.ok(!covers(buf, far[0], far[1]), 'the far edge still shows through the box');
});

test('a box cuts the horizon where the ridge would show through it', () => {
  const cam = makeCamera(0, 0, 0);
  const g = { obstacles: [{ type: 1, x: 0, z: 5000, facing: 0 }], enemy: null, saucers: [], shells: [], debris: [] };
  const buf = createLineBuffer();
  drawBackground(buf, cam, 0, worldOccluders(g, cam));
  assert.ok(covers(buf, 100, cam.horizonY), 'the horizon outside the box was removed');
  assert.ok(!covers(buf, VIEW.width / 2, cam.horizonY), 'the horizon still runs through the box');
});

test('a shell in front of a box is drawn and a shell behind it is not', () => {
  const cam = makeCamera(0, 0, 0);
  const box = { type: 1, x: 0, z: 5000, facing: 0 };
  const ahead = { x: 0, z: 2000, vx: 0, vz: 1 };
  const behind = { x: 0, z: 8000, vx: 0, vz: 1 };
  const solo = (shell) => {
    const buf = createLineBuffer();
    drawModel(buf, cam, SHAPES.shell, shell.x, 0, shell.z, Math.atan2(shell.vx, shell.vz));
    return segKeys(buf);
  };
  const worldOf = (shell) => {
    const buf = createLineBuffer();
    drawWorld(buf, { obstacles: [box], enemy: null, saucers: [], shells: [shell], debris: [] }, cam);
    return new Set(segKeys(buf));
  };
  const aheadKeys = solo(ahead);
  const behindKeys = solo(behind);
  assert.ok(aheadKeys.length > 0 && behindKeys.length > 0, 'the shell was culled instead of drawn');
  const frontWorld = worldOf(ahead);
  const backWorld = worldOf(behind);
  assert.ok(aheadKeys.every((k) => frontWorld.has(k)), 'the box clipped a shell that is closer than it is');
  assert.ok(behindKeys.every((k) => !backWorld.has(k)), 'a shell behind the box still shows through it');
});

test('the near side of a tank stays and the far side does not show through', () => {
  // Nose toward the camera. The gun lip is the near skin. The rear bottom edge
  // is on the far side of the hull, so it must not draw across the silhouette.
  const cam = makeCamera(0, 0, 0);
  const x = 0, y = 0, z = 6000, facing = Math.PI;
  const buf = createLineBuffer();
  drawWorld(buf, { obstacles: [], enemy: { kind: 'tank', x, y, z, facing, treadPhase: 0 }, saucers: [], shells: [], debris: [] }, cam);
  const lip = mid(cam, SHAPES.tank, 18, 20, x, y, z, facing);
  const rear = mid(cam, SHAPES.tank, 0, 1, x, y, z, facing);
  assert.ok(covers(buf, lip[0], lip[1]), 'the gun lip was treated as the far side');
  assert.ok(!covers(buf, rear[0], rear[1]), 'the rear edge still shows through the tank');
});

test('a box on the world seam does not mask the whole horizon', () => {
  // The seam box used to throw a 65536-unit edge across the view. An occluder
  // built from that edge would erase the horizon from edge to edge.
  const cam = makeCamera(0, 0, 0);
  const g = { obstacles: [{ type: 15, x: -32768, z: 16384, facing: Math.PI / 2 }], enemy: null, saucers: [], shells: [], debris: [] };
  const buf = createLineBuffer();
  drawBackground(buf, cam, 0, worldOccluders(g, cam));
  const hy = cam.horizonY;
  assert.ok(covers(buf, 8, hy) || covers(buf, VIEW.width - 8, hy), 'the seam box masked the whole horizon');
});

// Disco tread trails. A field with no obstacles, saucer, shells or debris draws
// nothing but the tanks, so once the enemy is gone every line is trail.
const trailField = (player) => ({ obstacles: [], enemy: null, saucers: [], shells: [], debris: [], player });

function drive(fx, g, unit, dz, seconds, steps = 40) {
  for (let i = 0; i < steps; i++) {
    unit.z += dz / steps;
    updateDisco(fx, g, seconds / steps);
  }
}

test('a tank leaves a trail that outlives it and then fades away', () => {
  // The marks are the tank's history, not its body: they stay on the ground after
  // the tank is destroyed, and they clear themselves once the trail life is up.
  const fx = createDisco();
  const g = trailField({ x: 0, z: 0, facing: 0, alive: false });
  const enemy = { kind: 'tank', x: 0, y: 0, z: 4000, facing: 0, treadPhase: 0 };
  g.enemy = enemy;
  drive(fx, g, enemy, 3000, 1);
  g.enemy = null;
  const cam = makeCamera(0, 0, 0);
  const now = createLineBuffer();
  drawWorld(now, g, cam, 0, [], fx);
  assert.ok(now.count > 0, 'the trail vanished with the tank');
  updateDisco(fx, g, DISCO.trailLife + 0.1);
  const later = createLineBuffer();
  drawWorld(later, g, cam, 0, [], fx);
  assert.equal(later.count, 0, 'the trail never faded');
});

test('a tank that jumps across the field does not draw a trail line across the gap', () => {
  // Respawning teleports a tank. Joining its old marks to its new ones would
  // paint a stripe across the battlefield that no tread ever made.
  const fx = createDisco();
  const g = trailField({ x: 0, z: 0, facing: 0, alive: false });
  const enemy = { kind: 'tank', x: -3000, y: 0, z: 5000, facing: 0, treadPhase: 0 };
  g.enemy = enemy;
  drive(fx, g, enemy, 2000, 0.7);
  enemy.x = 3000;
  enemy.z = 5000;
  drive(fx, g, enemy, 2000, 0.7);
  g.enemy = null;
  const buf = createLineBuffer();
  drawWorld(buf, g, makeCamera(0, 0, 0), 0, [], fx);
  assert.ok(buf.count > 0, 'neither stretch of trail was drawn');
  const mid = VIEW.width / 2;
  for (let i = 0; i < buf.count; i++) {
    const o = i * 5;
    const lo = Math.min(buf.data[o], buf.data[o + 2]), hi = Math.max(buf.data[o], buf.data[o + 2]);
    assert.ok(!(lo < mid - 100 && hi > mid + 100), `a trail line bridges the jump (${lo}..${hi})`);
  }
});

test('your own tank leaves a trail you can see when you look back', () => {
  const fx = createDisco();
  const player = { x: 0, z: 0, facing: 0, alive: true };
  const g = trailField(player);
  drive(fx, g, player, 3000, 1);
  const buf = createLineBuffer();
  drawWorld(buf, g, makeCamera(player.x, player.z, Math.PI), 0, [], fx);
  assert.ok(buf.count > 0, 'the player left no trail behind');
});

test('a shell in flight throws off sparks that outlive it and then burn out', () => {
  // The sparkle is a wake, not part of the shell: it hangs in the air behind the
  // shot after the shell is gone, then burns out once the spark life is up.
  const fx = createDisco();
  const g = trailField({ x: 0, z: 0, facing: 0, alive: false });
  const shell = { x: 0, z: 3000, vx: 0, vz: 16000 };
  g.shells = [shell];
  for (let i = 0; i < 30; i++) {
    shell.z += 16000 / 60;
    updateDisco(fx, g, 1 / 60);
  }
  g.shells = [];
  const cam = makeCamera(0, 0, 0);
  const now = createLineBuffer();
  drawWorld(now, g, cam, 0, [], fx);
  assert.ok(now.count > 0, 'the shell left no sparks behind');
  updateDisco(fx, g, DISCO.sparkLife + 0.1);
  const later = createLineBuffer();
  drawWorld(later, g, cam, 0, [], fx);
  assert.equal(later.count, 0, 'the sparks never burned out');
});

test('the saucer throws mirror-ball beams that sweep around it', () => {
  // A mirror ball's light is the beams turning, not the ball. A moment later the
  // beams must land somewhere new even while the saucer itself holds still.
  const fx = createDisco();
  const g = trailField({ x: 0, z: 0, facing: 0, alive: false });
  g.saucers = [{ x: 0, y: 0, z: 9000, vx: 0, vz: 0, retarget: 0, spin: 0 }];
  const cam = makeCamera(0, 0, 0);
  const frame = (t, disco) => {
    const buf = createLineBuffer();
    drawWorld(buf, g, cam, t, [], disco);
    return buf;
  };
  const plain = frame(0, null), now = frame(0, fx), later = frame(0.5, fx);
  assert.ok(now.count > plain.count, 'disco added no beams to the saucer');
  const before = new Set(segKeys(now));
  const moved = segKeys(later).filter((k) => !before.has(k));
  assert.ok(moved.length >= DISCO.ballCones, `only ${moved.length} beam pieces moved; the beams are not sweeping`);
});
