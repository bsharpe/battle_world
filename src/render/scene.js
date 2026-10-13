import { SHAPES, VG } from '../data/rom.js';
import { VIEW, MODEL_Y_SCALE, BG } from '../config.js';
import { TAU, wrapCoord, delta } from '../math.js';

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
  // Wrap the origin once. Local offsets are added in view space so a mesh
  // that straddles ±32768 is not torn into a 65536-unit edge.
  const [dx, dz] = delta(cam.x, cam.z, x, z);
  const ox = dx * cam.cos - dz * cam.sin, oz = dx * cam.sin + dz * cam.cos;
  if (oz < -4000 || oz > VIEW.far) return;
  const s = Math.sin(facing), c = Math.cos(facing);
  const v = shape.verts.map(([lx, ly, lz]) => {
    const lxw = lx * c + lz * s, lzw = -lx * s + lz * c;
    return [ox + lxw * cam.cos - lzw * cam.sin, y + ly * MODEL_Y_SCALE, oz + lxw * cam.sin + lzw * cam.cos];
  });
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
  // Volcano: up to 5 ballistic particles thrown from the crater (ROM UpdateVolcano).
  volcano.timer -= dt;
  if (volcano.timer <= 0 && volcano.particles.length < 5) {
    volcano.particles.push({ x: 0, y: 0, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 60 });
    volcano.timer = 0.25 + Math.random() * 0.3;
  }
  volcano.particles = volcano.particles.filter((p) => {
    p.vy -= 120 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < 0) return false;
    let base = (((BG.volcanoX + p.x - scroll) % 4096) + 4096) % 4096;
    if (base > 2048) base -= 4096;
    const px = W / 2 + base * LAND_PX, py = hy - (BG.volcanoY + BG.yOffset + p.y) * LAND_PX;
    buf.push(px, py, px, py, 1);
    return true;
  });
}

export function drawWorld(buf, g, cam, t = 0) {
  for (const o of g.obstacles) drawModel(buf, cam, SHAPES[OBSTACLE_SHAPES[o.type]], o.x, 0, o.z, o.facing);
  const e = g.enemy;
  if (e) {
    drawModel(buf, cam, SHAPES[ENEMY_SHAPES[e.kind]], e.x, e.y, e.z, e.facing);
    if (e.kind !== 'missile') {
      // Only the tread end facing the viewer is drawn; frames advance with distance travelled (reverse when backing up).
      // delta, not raw subtraction: the short wrap across ±32768 is the near end.
      const [dx, dz] = delta(e.x, e.z, cam.x, cam.z);
      const rel = Math.atan2(dx, dz) - e.facing;
      const rear = Math.cos(rel) < 0;
      const frame = ((Math.floor(e.treadPhase / 120) % 4) + 4) % 4;
      drawModel(buf, cam, SHAPES[`tread${(rear ? 0 : 4) + frame}`], e.x, e.y, e.z, e.facing);
    }
    if (e.kind === 'tank') {
      const s = Math.sin(e.facing), c = Math.cos(e.facing);
      drawModel(buf, cam, DISH, e.x + DISH_X * c + DISH_Z * s, e.y, e.z - DISH_X * s + DISH_Z * c, e.facing + t * 3);
    }
  }
  const s = g.saucer;
  if (s) drawModel(buf, cam, SHAPES.saucer, s.x, s.y, s.z, s.spin, s.dying > 0 ? s.dying / 2 : 1);
  for (const sh of g.shells) drawModel(buf, cam, SHAPES.shell, sh.x, 0, sh.z, Math.atan2(sh.vx, sh.vz));
  for (const d of g.debris) drawModel(buf, cam, SHAPES[d.shape], d.x, d.y, d.z, d.facing, Math.min(1, d.life));
}
