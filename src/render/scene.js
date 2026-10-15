import { SHAPES, VG } from '../data/rom.js';
import { VIEW, MODEL_Y_SCALE, BG, DISCO } from '../config.js';
import { TAU, wrapCoord, delta, dist } from '../math.js';
import { hullFaces, faceOccluder, visibleSpans, clipScreenLine, screenCovered, silhouettes, mergeCoplanar } from './occlude.js?v=17';

export function createLineBuffer(max = 32768) {
  const data = new Float32Array(max * 5);
  const text = new Float32Array(max * 5);
  const dots = new Float32Array(max * 5);
  const rgb = new Float32Array(max * 3), textRgb = new Float32Array(max * 3), dotRgb = new Float32Array(max * 3);
  return {
    data, text, dots, rgb, textRgb, dotRgb,
    color: [0.25, 1.0, 0.35],
    count: 0,
    textCount: 0,
    dotCount: 0,
    push(x0, y0, x1, y1, intensity) {
      if (this.count >= max) return;
      const i = this.count, o = this.count++ * 5;
      rgb.set(this.color, i * 3);
      data[o] = x0; data[o + 1] = y0; data[o + 2] = x1; data[o + 3] = y1; data[o + 4] = intensity;
    },
    // Glyphs and the wordmark skip the bloom pass.
    pushText(x0, y0, x1, y1, intensity) {
      if (this.textCount >= max) return;
      const i = this.textCount, o = this.textCount++ * 5;
      textRgb.set(this.color, i * 3);
      text[o] = x0; text[o + 1] = y0; text[o + 2] = x1; text[o + 3] = y1; text[o + 4] = intensity;
    },
    pushDot(x0, y0, x1, y1, intensity) {
      if (this.dotCount >= max) return;
      const i = this.dotCount, o = this.dotCount++ * 5;
      dotRgb.set(this.color, i * 3);
      dots[o] = x0; dots[o + 1] = y0; dots[o + 2] = x1; dots[o + 3] = y1; dots[o + 4] = intensity;
    },
    clear() { this.count = 0; this.textCount = 0; this.dotCount = 0; },
  };
}

const OBSTACLE_SHAPES = { 0: 'narrowPyramid', 1: 'tallBox', 12: 'widePyramid', 15: 'shortBox' };
// ROM spatter is eight dots in a flat ring. A dot at the line sigma vanishes, and a
// flat ring from the cockpit is an edge-on dash, so each dot is a spoke stood upright.
const BURST = Array.from({ length: 8 }, (_, n) => {
  const verts = [], segs = [];
  for (const [x, , z] of SHAPES[`spatter${n}`].verts) {
    const i = verts.length;
    verts.push([x * 0.45, z * 0.45 / MODEL_Y_SCALE, 0], [x, z / MODEL_Y_SCALE, 0]);
    segs.push([i, i + 1, 30]);
  }
  return { verts, segs };
});
const ENEMY_SHAPES = { tank: 'tank', super: 'superTank', missile: 'missile' };
const LAND_PX = VIEW.focal / (4096 / TAU); // px per AVG unit; one full turn matches the 3D camera
const NONE = [];
const HULL = new Map();
for (const name of ['narrowPyramid', 'tallBox', 'widePyramid', 'shortBox', 'tank', 'superTank', 'missile', 'saucer']) {
  HULL.set(SHAPES[name], hullFaces(SHAPES[name].verts));
}

const centroidXZ = (shape) => {
  const n = shape.verts.length;
  return [shape.verts.reduce((s, v) => s + v[0], 0) / n, shape.verts.reduce((s, v) => s + v[2], 0) / n];
};
const [DISH_X, DISH_Z] = centroidXZ(SHAPES.radarDish);
const DISH = { verts: SHAPES.radarDish.verts.map(([x, y, z]) => [x - DISH_X, y, z - DISH_Z]), segs: SHAPES.radarDish.segs };
const volcano = { particles: [], timer: 0 };

export function makeCamera(x, z, facing, jolt = 0) {
  return { x, z, facing, sin: Math.sin(facing), cos: Math.cos(facing), horizonY: VIEW.height / 2 + jolt * VIEW.joltPx };
}

function toView(cam, wx, wy, wz) {
  const dx = wrapCoord(wx - cam.x), dz = wrapCoord(wz - cam.z);
  return [dx * cam.cos - dz * cam.sin, wy, dx * cam.sin + dz * cam.cos];
}

const fade = (z) => Math.max(0.35, Math.min(1, 1.15 - z / 30000));

function pushView(buf, cam, a, b, bright) {
  const f = VIEW.focal, cx = VIEW.width / 2, hy = cam.horizonY;
  buf.push(cx + (a[0] * f) / a[2], hy - (a[1] * f) / a[2], cx + (b[0] * f) / b[2], hy - (b[1] * f) / b[2], bright * fade(Math.min(a[2], b[2])));
}

function segment(buf, cam, a, b, bright, occ, owner) {
  let [ax, ay, az] = a, [bx, by, bz] = b;
  const n = VIEW.near;
  if (az < n && bz < n) return;
  if (az < n) { const t = (n - az) / (bz - az); ax += (bx - ax) * t; ay += (by - ay) * t; az = n; }
  if (bz < n) { const t = (n - bz) / (az - bz); bx += (ax - bx) * t; by += (ay - by) * t; bz = n; }
  const A = [ax, ay, az], B = [bx, by, bz];
  if (!occ.length) { pushView(buf, cam, A, B, bright); return; }
  for (const [t0, t1] of visibleSpans(cam, A, B, occ, owner)) {
    const p = t0 <= 0 ? A : [ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0];
    const q = t1 >= 1 ? B : [ax + (bx - ax) * t1, ay + (by - ay) * t1, az + (bz - az) * t1];
    pushView(buf, cam, p, q, bright);
  }
}

function placeVerts(cam, shape, x, y, z, facing) {
  // Wrap the origin once. Local offsets are added in view space so a mesh
  // that straddles ±32768 is not torn into a 65536-unit edge.
  const [dx, dz] = delta(cam.x, cam.z, x, z);
  const ox = dx * cam.cos - dz * cam.sin, oz = dx * cam.sin + dz * cam.cos;
  if (oz < -4000 || oz > VIEW.far) return null;
  const s = Math.sin(facing), c = Math.cos(facing);
  return shape.verts.map(([lx, ly, lz]) => {
    const lxw = lx * c + lz * s, lzw = -lx * s + lz * c;
    return [ox + lxw * cam.cos - lzw * cam.sin, y + ly * MODEL_Y_SCALE, oz + lxw * cam.sin + lzw * cam.cos];
  });
}

export function modelOccluders(cam, shape, x, y, z, facing, owner) {
  const tris = HULL.get(shape);
  if (!tris) return [];
  const v = placeVerts(cam, shape, x, y, z, facing);
  if (!v) return [];
  // The far side of a tank is most of its length behind the fenders. A fixed skin
  // would also erase the gun, which sits in that same pocket.
  let z0 = Infinity, z1 = -Infinity;
  for (const p of v) {
    if (p[2] < z0) z0 = p[2];
    if (p[2] > z1) z1 = p[2];
  }
  const ownSlop = Math.max(96, (z1 - z0) * 0.42);
  const out = [];
  for (const [i, j, k] of tris) {
    const face = faceOccluder(cam, v[i], v[j], v[k], owner, ownSlop);
    if (face) out.push(face);
  }
  return mergeCoplanar(out);
}

export function worldOccluders(g, cam) {
  const out = [];
  g.obstacles.forEach((o, i) => {
    const shape = SHAPES[OBSTACLE_SHAPES[o.type]];
    if (shape) out.push(...modelOccluders(cam, shape, o.x, 0, o.z, o.facing, `obs:${i}`));
  });
  const e = g.enemy;
  if (e && ENEMY_SHAPES[e.kind]) out.push(...modelOccluders(cam, SHAPES[ENEMY_SHAPES[e.kind]], e.x, e.y, e.z, e.facing, 'enemy'));
  const s = g.saucer;
  if (s) out.push(...modelOccluders(cam, SHAPES.saucer, s.x, s.y, s.z, s.spin, 'saucer'));
  return out;
}

export function inView(cam, x, z) {
  const [vx, , vz] = toView(cam, x, 0, z);
  return vz > VIEW.near && vz < VIEW.far && Math.abs(vx) < (vz * VIEW.width) / 2 / VIEW.focal;
}

export function drawModel(buf, cam, shape, x, y, z, facing, bright = 1, occ = NONE, owner = null) {
  const v = placeVerts(cam, shape, x, y, z, facing);
  if (!v) return;
  for (const [i, j, inten] of shape.segs) segment(buf, cam, v[i], v[j], (bright * inten) / VIEW.modelIntensity, occ, owner);
}

// Landscape: 8 sections of 512 AVG units = 4096 per full turn, scrolled by facing.
function pushScreen(buf, x0, y0, x1, y1, inten, occ) {
  for (const [a, b, c, d] of clipScreenLine(x0, y0, x1, y1, occ)) buf.push(a, b, c, d, inten);
}

// ROM mountains top out at y=96; every landscape stroke above that is the moon.
const MOON_Y = 100;
// Five-petal rose r = |cos(5θ/2)|, the vector stand-in for a cherry blossom.
const BLOSSOM = Array.from({ length: 41 }, (_, k) => {
  const a = (k / 40) * TAU, r = Math.abs(Math.cos(2.5 * a));
  return [r * Math.cos(a), r * Math.sin(a)];
});

export function drawBackground(buf, cam, dt, occ = NONE, fx = null) {
  // The backdrop is infinitely far, so an object's outline hides it. Depth stays
  // on the per-face list that drawWorld uses.
  const mask = occ.length ? silhouettes(occ) : occ;
  const W = VIEW.width, hy = cam.horizonY, color = buf.color;
  pushScreen(buf, 0, hy, W, hy, 0.8, mask);
  const scroll = (cam.facing / TAU) * 4096 + BG.phase;
  VG.landscape.forEach((segs, i) => {
    let base = (((i * 512 - scroll) % 4096) + 4096) % 4096;
    if (base > 2048) base -= 4096;
    segs.forEach(([x0, y0, x1, y1, inten], j) => {
      if (fx) buf.color = Math.min(y0, y1) >= MOON_Y ? DISCO.moon : DISCO.browns[(i + j) % DISCO.browns.length];
      pushScreen(buf, W / 2 + (base + x0) * LAND_PX, hy - (y0 + BG.yOffset) * LAND_PX, W / 2 + (base + x1) * LAND_PX, hy - (y1 + BG.yOffset) * LAND_PX, inten / 12, mask);
    });
  });
  buf.color = color;
  // Volcano: up to 5 ballistic particles thrown from the crater (ROM UpdateVolcano).
  volcano.timer -= dt;
  if (volcano.timer <= 0 && volcano.particles.length < 5) {
    volcano.particles.push({ x: 0, y: 0, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 60, a: Math.random() * TAU });
    volcano.timer = 0.25 + Math.random() * 0.3;
  }
  volcano.particles = volcano.particles.filter((p) => {
    p.vy -= 120 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.a += 2 * dt;
    if (p.y < 0) return false;
    let base = (((BG.volcanoX + p.x - scroll) % 4096) + 4096) % 4096;
    if (base > 2048) base -= 4096;
    const px = W / 2 + base * LAND_PX, py = hy - (BG.volcanoY + BG.yOffset + p.y) * LAND_PX;
    if (fx) {
      const R = DISCO.blossomPx, s = Math.sin(p.a) * R, c = Math.cos(p.a) * R;
      buf.color = DISCO.blossom;
      for (let k = 0; k < BLOSSOM.length - 1; k++) {
        const [ax, ay] = BLOSSOM[k], [bx, by] = BLOSSOM[k + 1];
        pushScreen(buf, px + ax * c - ay * s, py + ax * s + ay * c, px + bx * c - by * s, py + bx * s + by * c, 1.2, mask);
      }
      buf.color = color;
    } else if (!screenCovered(px, py, mask)) {
      // A zero-length stroke at the line sigma is a speck the half-res bloom cannot lift.
      buf.pushDot(px, py, px, py, 2.5);
    }
    return true;
  });
}

export function createDisco() { return { obstacles: [], strands: [], sparks: [], t: 0 }; }

const hueRgb = (h) => [0, 4, 2].map((k) => Math.min(1, Math.max(0, Math.abs(((h + k) % 6) - 3) - 1)));

// Math.random, not the game rng: colors must not touch gameplay.
export function updateDisco(fx, g, dt) {
  g.obstacles.forEach((o, i) => {
    const s = fx.obstacles[i] ??= { color: null, timer: 0 };
    if ((s.timer -= dt) > 0) return;
    const h = Math.random() * 6;
    s.color = hueRgb(h);
    s.timer = DISCO.flipMin + Math.random() * (DISCO.flipMax - DISCO.flipMin);
  });
  fx.t += dt;
  const units = [];
  if (g.player.alive) units.push(g.player);
  if (g.enemy && (g.enemy.kind === 'tank' || g.enemy.kind === 'super')) units.push(g.enemy);
  for (const u of units) {
    let s = fx.strands.find((k) => k.unit === u);
    if (s && s.pts.length && dist(s.pts.at(-1).x, s.pts.at(-1).z, u.x, u.z) > DISCO.trailBreak) { s.unit = null; s = null; }
    if (!s) fx.strands.push(s = { unit: u, travel: 0, pts: [] });
    const last = s.pts.at(-1), d = last ? dist(last.x, last.z, u.x, u.z) : 0;
    if (last && d < DISCO.trailStep) continue;
    s.travel += d;
    s.pts.push({ x: u.x, z: u.z, facing: u.facing, born: fx.t, hue: (s.travel / DISCO.rainbowLen % 1) * 6 });
  }
  for (const s of fx.strands) s.pts = s.pts.filter((p) => fx.t - p.born < DISCO.trailLife);
  fx.strands = fx.strands.filter((s) => s.pts.length || units.includes(s.unit));
  const sy = -28 * MODEL_Y_SCALE, spread = DISCO.sparkSpread, [lo, hi] = DISCO.sparkLift;
  for (const sh of g.shells) {
    for (let n = Math.floor(DISCO.sparkRate * dt + Math.random()); n > 0; n--) {
      fx.sparks.push({
        x: sh.x, y: sy, z: sh.z,
        vx: (Math.random() * 2 - 1) * spread + 0.05 * sh.vx, vy: lo + Math.random() * (hi - lo), vz: (Math.random() * 2 - 1) * spread + 0.05 * sh.vz,
        born: fx.t, color: hueRgb(Math.random() * 6),
      });
    }
  }
  for (const p of fx.sparks) {
    p.vy -= DISCO.sparkGravity * dt;
    p.x = wrapCoord(p.x + p.vx * dt); p.y += p.vy * dt; p.z = wrapCoord(p.z + p.vz * dt);
  }
  fx.sparks = fx.sparks.filter((p) => fx.t - p.born < DISCO.sparkLife && p.y >= -320 * MODEL_Y_SCALE);
}

export function drawWorld(buf, g, cam, t = 0, occ = worldOccluders(g, cam), fx = null) {
  const base = buf.color;
  if (fx) {
    const y = -320 * MODEL_Y_SCALE;
    for (const { pts } of fx.strands) for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], bright = 1 - (fx.t - p.born) / DISCO.trailLife;
      buf.color = hueRgb(p.hue);
      const [ax, , az] = toView(cam, p.x, y, p.z);
      const [qx, qz] = delta(p.x, p.z, q.x, q.z);
      // Offsets from p, not toView per end: a segment straddling ±32768 must not tear.
      const at = (dx, dz) => [ax + dx * cam.cos - dz * cam.sin, y, az + dx * cam.sin + dz * cam.cos];
      // Each tread prints a band: two rails, and a cleat bar across it at every recorded point.
      const side = (pt, ox, oz, k) => at(ox + k * Math.cos(pt.facing), oz - k * Math.sin(pt.facing));
      for (const sd of [-1, 1]) {
        const k0 = sd * DISCO.trailGauge - DISCO.trailBand, k1 = sd * DISCO.trailGauge + DISCO.trailBand;
        for (const k of [k0, k1]) segment(buf, cam, side(p, 0, 0, k), side(q, qx, qz, k), bright, occ);
        segment(buf, cam, side(p, 0, 0, k0), side(p, 0, 0, k1), bright, occ);
      }
    }
    for (const p of fx.sparks) {
      buf.color = p.color;
      const a = toView(cam, p.x, p.y, p.z), k = -DISCO.sparkStreak, dx = p.vx * k, dz = p.vz * k;
      const b = [a[0] + dx * cam.cos - dz * cam.sin, a[1] + p.vy * k, a[2] + dx * cam.sin + dz * cam.cos];
      segment(buf, cam, a, b, 1.5 * (1 - (fx.t - p.born) / DISCO.sparkLife), occ);
    }
    const sc = g.saucer;
    if (sc) {
      const o = toView(cam, sc.x, sc.y + 80 * MODEL_Y_SCALE, sc.z), h = o[1] + 320 * MODEL_Y_SCALE;
      const beamOcc = occ.filter((face) => face.owner !== 'saucer'), n = DISCO.beamFade.length;
      for (let i = 0; i < DISCO.beams; i++) {
        const a = (i / DISCO.beams) * TAU + t * DISCO.beamSpin, r = DISCO.beamReach[i % 2];
        const at = (k) => {
          const dx = Math.sin(a) * r * k, dz = Math.cos(a) * r * k;
          return [o[0] + dx * cam.cos - dz * cam.sin, o[1] - h * k, o[2] + dx * cam.sin + dz * cam.cos];
        };
        buf.color = hueRgb((i / DISCO.beams) * 6);
        for (let j = 0; j < n; j++) segment(buf, cam, at(j / n), at((j + 1) / n), DISCO.beamFade[j], beamOcc);
      }
    }
    buf.color = base;
  }
  g.obstacles.forEach((o, i) => {
    if (fx) buf.color = fx.obstacles[i]?.color ?? base;
    drawModel(buf, cam, SHAPES[OBSTACLE_SHAPES[o.type]], o.x, 0, o.z, o.facing, 1, occ, `obs:${i}`);
    buf.color = base;
  });
  const e = g.enemy;
  if (e) {
    if (fx && (e.kind === 'tank' || e.kind === 'super')) buf.color = DISCO.white;
    drawModel(buf, cam, SHAPES[ENEMY_SHAPES[e.kind]], e.x, e.y, e.z, e.facing, 1, occ, 'enemy');
    if (e.kind === 'tank') {
      // Only the tread end facing the viewer is drawn; frames advance with distance travelled (reverse when backing up).
      // delta, not raw subtraction: the short wrap across ±32768 is the near end.
      // The bars sit just inside the hull, so the tank's own faces must not mask them.
      const [dx, dz] = delta(e.x, e.z, cam.x, cam.z);
      const rel = Math.atan2(dx, dz) - e.facing;
      const rear = Math.cos(rel) < 0;
      const frame = ((Math.floor(e.treadPhase / 120) % 4) + 4) % 4;
      const treadOcc = occ.filter((face) => face.owner !== 'enemy');
      drawModel(buf, cam, SHAPES[`tread${(rear ? 0 : 4) + frame}`], e.x, e.y, e.z, e.facing, 1, treadOcc);
    }
    if (e.kind === 'tank') {
      const s = Math.sin(e.facing), c = Math.cos(e.facing);
      drawModel(buf, cam, DISH, e.x + DISH_X * c + DISH_Z * s, e.y, e.z - DISH_X * s + DISH_Z * c, e.facing + t * 3, 1, occ, 'enemy');
    }
    buf.color = base;
  }
  const s = g.saucer;
  if (s) drawModel(buf, cam, SHAPES.saucer, s.x, s.y, s.z, s.spin, 1, occ, 'saucer');
  for (const sh of g.shells) drawModel(buf, cam, SHAPES.shell, sh.x, 0, sh.z, Math.atan2(sh.vx, sh.vz), 1, occ);
  for (const d of g.debris) {
    if (d.burst) {
      // Saucer disc is model y=80. The ring replaces the craft on that plane.
      drawModel(buf, cam, BURST[d.frame], d.x, d.y + 80 * MODEL_Y_SCALE, d.z, 0, 1.6, occ);
    } else {
      if (fx && (d.kind === 'tank' || d.kind === 'super')) buf.color = DISCO.white;
      drawModel(buf, cam, SHAPES[d.shape], d.x, d.y, d.z, d.facing, Math.min(1, d.life), occ);
      buf.color = base;
    }
  }
}
