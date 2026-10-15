import { VG, GLYPHS, STRINGS } from '../data/rom.js';
import { VIEW, RADAR, MESSAGES, HUD, ENEMY, DISCO } from '../config.js';
import { wrapAngle, bearing, delta, mulberry32, TAU } from '../math.js';

const S = VIEW.height / 768, CX = VIEW.width / 2, CY = VIEW.height / 2;

export function drawAvg(buf, segs, ox = 0, oy = 0, scale = 1, bright = 1, text = false) {
  const put = text ? buf.pushText : buf.push;
  for (const [x0, y0, x1, y1, i] of segs) {
    put.call(buf, CX + (ox + x0 * scale) * S, CY - (oy + y0 * scale) * S, CX + (ox + x1 * scale) * S, CY - (oy + y1 * scale) * S, (bright * i) / 12);
  }
}

// ROM strings are drawn at half glyph size: 24-unit advance × 0.5.
export function drawText(buf, text, x, y, bright = 1, scale = 0.5) {
  for (const ch of text) {
    if (GLYPHS[ch]) drawAvg(buf, GLYPHS[ch], x, y, scale, bright, true);
    x += 24 * scale;
  }
}

export function say(buf, prefix, text) {
  const s = STRINGS.find((e) => e.text.startsWith(prefix));
  if (s) drawText(buf, text ?? s.text, s.x, s.y);
}

export function relativeView(player, x, z) {
  const [dx, dz] = delta(player.x, player.z, x, z), c = Math.cos(player.facing), s = Math.sin(player.facing);
  return [dx * c - dz * s, dx * s + dz * c];
}

export function radarBlip(player, target) {
  const [rx, rz] = relativeView(player, target.x, target.z);
  if (Math.hypot(rx, rz) > RADAR.range) return null;
  const k = RADAR.radiusUnits / RADAR.range;
  return [rx * k, rz * k];
}

export function enemyDirection(player, target) {
  const rel = wrapAngle(bearing(player.x, player.z, target.x, target.z) - player.facing);
  if (Math.abs(rel) >= MESSAGES.rearAngle) return 'REAR';
  if (rel >= MESSAGES.sideAngle) return 'RIGHT';
  if (rel <= -MESSAGES.sideAngle) return 'LEFT';
  return null;
}

export function enemyInRange(player, target) {
  if ((target.y ?? 0) >= ENEMY.missile.hittableBelow) return false;
  const [rx, rz] = relativeView(player, target.x, target.z);
  return rz > 0 && Math.abs(rx) < (rz * VIEW.width) / 2 / VIEW.focal && Math.hypot(rx, rz) < RADAR.range;
}

export function onTarget(player, target) {
  if ((target.y ?? 0) >= ENEMY.missile.hittableBelow) return false;
  const [rx, rz] = relativeView(player, target.x, target.z);
  return rz > 0 && rz < RADAR.range && Math.abs(rx) < ENEMY.hitRadius;
}

export function sweepCrossed(from, to, angle) {
  const span = wrapAngle(to - from), off = wrapAngle(angle - from);
  return span > 0 && off > 0 && off <= span;
}

export const createHudState = () => ({ sweep: 0, blip: null, blipGlow: 0 });

export function updateHudState(h, g, dt) {
  const next = h.sweep + RADAR.sweepRate * dt;
  h.blip = g.enemy && g.player.alive ? radarBlip(g.player, g.enemy) : null;
  h.blipGlow = Math.max(0, h.blipGlow - dt * 1.5);
  let pinged = false;
  if (h.blip && sweepCrossed(h.sweep, next, Math.atan2(h.blip[0], h.blip[1]))) {
    h.blipGlow = 1;
    pinged = true;
  }
  h.sweep = wrapAngle(next);
  return pinged;
}

// Rings are strung between crack crossings so every chord starts and ends on a crack.
export function glassWeb(seed) {
  const rng = mulberry32(seed), spokes = [], rings = [], star = [];
  for (let i = 0; i < DISCO.glassSpokes; i++) {
    let ang = (i / DISCO.glassSpokes) * TAU + (rng() - 0.5) * 0.5, r = 0, x = 0, y = 0;
    while (r < 480) {
      r += 60 + rng() * 60;
      ang += (rng() - 0.5) * 0.3;
      const nx = Math.cos(ang) * r, ny = Math.sin(ang) * r;
      spokes.push([x, y, nx, ny]);
      x = nx; y = ny;
    }
  }
  const cracks = [...VG.cracks.flat(), ...spokes];
  DISCO.glassRings.forEach((r, k) => {
    const pts = [];
    for (const [x0, y0, x1, y1] of cracks) {
      const dx = x1 - x0, dy = y1 - y0;
      const a = dx * dx + dy * dy, b = 2 * (x0 * dx + y0 * dy), c = x0 * x0 + y0 * y0 - r * r;
      const disc = b * b - 4 * a * c;
      if (a === 0 || disc < 0) continue;
      for (const t of [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]) {
        if (t >= 0 && t <= 1) pts.push([x0 + t * dx, y0 + t * dy]);
      }
    }
    pts.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
    pts.forEach(([ax, ay], i) => {
      const [bx, by] = pts[(i + 1) % pts.length];
      const gap = Math.abs(wrapAngle(Math.atan2(by, bx) - Math.atan2(ay, ax))), len = Math.hypot(bx - ax, by - ay);
      if (gap > 1.75 || len < 2 || rng() < 0.25) return;
      const s = 0.5 * (0.88 + rng() * 0.08), nudge = (rng() - 0.5) * 0.1;
      rings.push([ax, ay, (ax + bx) * s - (by - ay) * nudge, (ay + by) * s + (bx - ax) * nudge, bx, by, k]);
    });
  });
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * TAU + (rng() - 0.5) * 0.4, len = 12 + rng() * 28, bend = (rng() - 0.5) * 8;
    const c = Math.cos(ang), s = Math.sin(ang), mx = c * len * 0.6 - s * bend, my = s * len * 0.6 + c * bend;
    star.push([0, 0, mx, my], [mx, my, c * len, s * len]);
  }
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU;
    star.push([Math.cos(a0) * 8, Math.sin(a0) * 8, Math.cos(a1) * 8, Math.sin(a1) * 8]);
  }
  const glints = Array.from({ length: 5 }, () => {
    const [x0, y0, x1, y1] = cracks[Math.floor(rng() * cracks.length)], t = rng();
    return [x0 + t * (x1 - x0), y0 + t * (y1 - y0), rng() * TAU];
  });
  return { spokes, rings, star, glints };
}

function drawGlass(buf, deadFor, t, seed) {
  const color = buf.color, { spokes, rings, star, glints } = glassWeb(seed);
  buf.color = DISCO.glass;
  const groups = Math.floor(deadFor * 24) + 1, reach = 480 * Math.min(1, groups / VG.cracks.length);
  VG.cracks.slice(0, groups).forEach((segs) => drawAvg(buf, segs));
  // Spokes spread outward in step with the ROM cracks.
  drawAvg(buf, spokes.filter(([x0, y0]) => Math.hypot(x0, y0) < reach).map((s) => [...s, 12]));
  drawAvg(buf, star.map((s) => [...s, 12]));
  for (const [ax, ay, mx, my, bx, by, k] of rings) {
    if (deadFor > DISCO.glassRingDelay + k * DISCO.glassRingStep) drawAvg(buf, [[ax, ay, mx, my, 12], [mx, my, bx, by, 12]]);
  }
  if (deadFor > DISCO.glassRingDelay) {
    buf.color = DISCO.white;
    for (const [x, y, phase] of glints) {
      const h = 10 * (0.6 + 0.4 * Math.sin(t * 6 + phase));
      drawAvg(buf, [[x - h, y, x + h, y, 19], [x, y - h, x, y + h, 19]]);
    }
  }
  buf.color = color;
}

export function drawHud(buf, g, h, highScore, t, fx = null) {
  const p = g.player, blinkOn = Math.floor(t * MESSAGES.blinkHz * 2) % 2 === 0;
  say(buf, 'SCORE', `SCORE${String(g.score).padStart(8)}`);
  say(buf, 'HIGH SCORE ', `HIGH SCORE ${String(highScore).padStart(8)}`);
  for (let i = 0; i < g.lives; i++) drawAvg(buf, VG.life.segs, HUD.livesX + i * HUD.livesSpacing, HUD.livesY);

  drawAvg(buf, VG.radar.segs);
  const [rx, ry] = VG.radar.end, r = RADAR.radiusUnits;
  drawAvg(buf, [[0, 0, Math.sin(h.sweep) * r, Math.cos(h.sweep) * r, 8]], rx, ry);
  if (h.blip) {
    const sx = CX + (rx + h.blip[0]) * S, sy = CY - (ry + h.blip[1]) * S;
    buf.pushDot(sx, sy, sx, sy, (4 + 11 * h.blipGlow) / 12);
  }

  if (g.enemy && p.alive) {
    if (enemyInRange(p, g.enemy)) say(buf, 'ENEMY IN RANGE');
    const dir = enemyDirection(p, g.enemy);
    if (dir && blinkOn) say(buf, 'ENEMY TO', `ENEMY TO ${dir}`);
  }
  if (g.blockedFor > 0) say(buf, 'MOTION BLOCKED');
  if (p.alive) drawAvg(buf, (g.enemy && onTarget(p, g.enemy) ? VG.reticle2 : VG.reticle1).segs);
  else if (fx) drawGlass(buf, p.deadFor, t, ((Math.floor(p.x) * 73856093) ^ (Math.floor(p.z) * 19349663)) >>> 0);
  else VG.cracks.slice(0, Math.floor(p.deadFor * 24) + 1).forEach((segs) => drawAvg(buf, segs));
  if (g.over) {
    // Full glyph size. Every other message stays at the ROM half-glyph scale.
    const over = STRINGS.find((e) => e.text === 'GAME OVER');
    drawText(buf, over.text, over.x, over.y, 1, 1);
  }
}

// Game-font wordmark in the old logotype slot. Glyphs are 16 wide on a 24 advance and 24 tall.
const TITLE_SCALE = 3;
const TITLE_GAP = 10;
const TITLE_TOP = 40;

export function drawTitle(buf) {
  const oy1 = (VIEW.height / 2 - TITLE_TOP) / S - 24 * TITLE_SCALE;
  const oy2 = oy1 - 24 * TITLE_SCALE - TITLE_GAP;
  const lineX = (text) => -((text.length - 1) * 24 + 16) * TITLE_SCALE / 2;
  drawText(buf, 'BATTLE', lineX('BATTLE'), oy1, 1, TITLE_SCALE);
  drawText(buf, 'WORLD', lineX('WORLD'), oy2, 1, TITLE_SCALE);
}

export function drawAttractText(buf, t, scores) {
  if (Math.floor(t / 6) % 2 === 1) {
    say(buf, 'HIGH SCORES');
    scores.forEach((s, i) => drawText(buf, `${String(s.score).padStart(7)}  ${s.initials}`, -120, 120 - i * 20));
  } else if (Math.floor(t * 2) % 2 === 0) drawText(buf, 'PRESS START', -136, -200);
  const bonus = 'BONUS TANK AT 15000 AND 100000', mid = STRINGS.find((e) => e.text === 'BONUS TANK AT').x + textWidth(bonus) / 2;
  say(buf, 'BONUS TANK AT', bonus);
  CONTROLS.forEach((row, i) => drawText(buf, row, mid - textWidth(row) / 2, -316 - i * 24, 0.7));
}

const textWidth = (text, scale = 0.5) => ((text.length - 1) * 24 + 16) * scale;

// U is left off on purpose: it's a hidden show-off key.
const CONTROLS = ['ENTER START  SPACE FIRE  WASD OR ARROWS MOVE', 'T TREADS  C COLOR  F FULLSCREEN'];

const MODE_NAMES = { green: 'ORIGINAL MODE', amber: 'AMBER MODE', disco: 'DISCO MODE' };
const BANNER = { scale: 1.5, y: -140, hold: 1.5, fade: 0.5 }; // y sits between the horizon and PRESS START

// Names the color mode C just switched to: held, then faded out. t is seconds since the switch.
export function drawModeBanner(buf, phosphor, t) {
  const bright = Math.min(1, (BANNER.hold + BANNER.fade - t) / BANNER.fade), text = MODE_NAMES[phosphor];
  if (bright <= 0) return;
  drawText(buf, text, -textWidth(text, BANNER.scale) / 2, BANNER.y, bright, BANNER.scale);
}

export function drawInitials(buf, entry, letters, t) {
  say(buf, 'GREAT SCORE');
  say(buf, 'ENTER YOUR INITIALS');
  say(buf, 'CHANGE LETTER');
  say(buf, 'SELECT LETTER');
  entry.letters.forEach((li, i) => {
    if (i === entry.pos && Math.floor(t * 4) % 2) return;
    drawText(buf, letters[li], -36 + i * 36, -40, 1, 1);
  });
}
