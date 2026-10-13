import { SHAPES, VG } from '../data/rom.js';
import { VIEW, MODEL_Y_SCALE, BG } from '../config.js';
import { TAU, wrapCoord } from '../math.js';

export function createLineBuffer(max = 32768) {
  const data = new Float32Array(max * 5);
  return {
    data,
    count: 0,
    push(x0, y0, x1, y1, intensity) {
      if (this.count >= max) return;
      const o = this.count++ * 5;
      data[o] = x0; data[o + 1] = y0; data[o + 2] = x1; data[o + 3] = y1; data[o + 4] = intensity;
    },
    clear() { this.count = 0; },
  };
}

const OBSTACLE_SHAPES = { 0: 'narrowPyramid', 1: 'tallBox', 12: 'widePyramid', 15: 'shortBox' };
const ENEMY_SHAPES = { tank: 'tank', super: 'superTank', missile: 'missile' };
const LAND_PX = VIEW.focal / (4096 / TAU); // px per AVG unit; one full turn matches the 3D camera

export function makeCamera(x, z, facing, jolt = 0) {
  return { x, z, facing, sin: Math.sin(facing), cos: Math.cos(facing), horizonY: VIEW.height / 2 + jolt * VIEW.joltPx };
}

function toView(cam, wx, wy, wz) {
  const dx = wrapCoord(wx - cam.x), dz = wrapCoord(wz - cam.z);
  return [dx * cam.cos - dz * cam.sin, wy, dx * cam.sin + dz * cam.cos];
}

const fade = (z) => Math.max(0.35, Math.min(1, 1.15 - z / 30000));

function segment(buf, cam, a, b, bright) {
  let [ax, ay, az] = a, [bx, by, bz] = b;
  const n = VIEW.near;
  if (az < n && bz < n) return;
  if (az < n) { const t = (n - az) / (bz - az); ax += (bx - ax) * t; ay += (by - ay) * t; az = n; }
  if (bz < n) { const t = (n - bz) / (az - bz); bx += (ax - bx) * t; by += (ay - by) * t; bz = n; }
  const f = VIEW.focal, cx = VIEW.width / 2, hy = cam.horizonY;
  buf.push(cx + (ax * f) / az, hy - (ay * f) / az, cx + (bx * f) / bz, hy - (by * f) / bz, bright * fade(Math.min(az, bz)));
}

export function inView(cam, x, z) {
  const [vx, , vz] = toView(cam, x, 0, z);
  return vz > VIEW.near && vz < VIEW.far && Math.abs(vx) < (vz * VIEW.width) / 2 / VIEW.focal;
}

export function drawModel(buf, cam, shape, x, y, z, facing, bright = 1) {
  const cz = toView(cam, x, 0, z)[2];
  if (cz < -4000 || cz > VIEW.far) return;
  const s = Math.sin(facing), c = Math.cos(facing);
  const v = shape.verts.map(([lx, ly, lz]) => toView(cam, x + lx * c + lz * s, y + ly * MODEL_Y_SCALE, z - lx * s + lz * c));
  for (const [i, j, inten] of shape.segs) segment(buf, cam, v[i], v[j], (bright * inten) / VIEW.modelIntensity);
}

// Landscape: 8 sections of 512 AVG units = 4096 per full turn, scrolled by facing.
export function drawBackground(buf, cam, dt) {
  const W = VIEW.width, hy = cam.horizonY;
  buf.push(0, hy, W, hy, 0.8);
  const scroll = (cam.facing / TAU) * 4096 + BG.phase;
  VG.landscape.forEach((segs, i) => {
    let base = (((i * 512 - scroll) % 4096) + 4096) % 4096;
    if (base > 2048) base -= 4096;
    for (const [x0, y0, x1, y1, inten] of segs) {
      buf.push(W / 2 + (base + x0) * LAND_PX, hy - (y0 + BG.yOffset) * LAND_PX, W / 2 + (base + x1) * LAND_PX, hy - (y1 + BG.yOffset) * LAND_PX, inten / 12);
    }
  });
}

export function drawWorld(buf, g, cam) {
  for (const o of g.obstacles) drawModel(buf, cam, SHAPES[OBSTACLE_SHAPES[o.type]], o.x, 0, o.z, o.facing);
  const e = g.enemy;
  if (e) drawModel(buf, cam, SHAPES[ENEMY_SHAPES[e.kind]], e.x, e.y, e.z, e.facing);
  const s = g.saucer;
  if (s) drawModel(buf, cam, SHAPES.saucer, s.x, s.y, s.z, s.spin, s.dying > 0 ? s.dying / 2 : 1);
  for (const sh of g.shells) drawModel(buf, cam, SHAPES.shell, sh.x, 0, sh.z, Math.atan2(sh.vx, sh.vz));
  for (const d of g.debris) drawModel(buf, cam, SHAPES[d.shape], d.x, d.y, d.z, d.facing, Math.min(1, d.life));
}
