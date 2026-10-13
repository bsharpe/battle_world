import { VG, GLYPHS, STRINGS } from '../data/rom.js';
import { VIEW, RADAR, MESSAGES, HUD, ENEMY } from '../config.js';
import { wrapAngle, bearing, delta } from '../math.js';

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

export function drawHud(buf, g, h, highScore, t) {
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
  say(buf, 'BONUS TANK AT', 'BONUS TANK AT 15000 AND 100000');
  say(buf, '(C)(P)');
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
