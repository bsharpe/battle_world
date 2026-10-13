import { ENEMY, RULES } from './config.js';
import { TAU, clamp, wrapAngle, wrapCoord, bearing, dist } from './math.js';
import { obstacleAt, unitBlocked } from './world.js';

export function makeEnemy(kind, x, z, facing = 0) {
  return {
    kind, x, z, facing, goal: facing,
    y: kind === 'missile' ? ENEMY.missile.spawnAlt : 0,
    age: 0, aimTimer: 0, reverseFor: 0, zigSide: 1, zigTimer: 0, straight: false, treadPhase: 0,
  };
}

export function chooseKind(g) {
  if (!g.forceGround && g.score >= RULES.missileScore && g.rng() < 0.5) return 'missile';
  return g.missilesLaunched >= RULES.superAfterMissiles ? 'super' : 'tank';
}

export function spawnEnemy(g) {
  const kind = chooseKind(g), p = g.player;
  g.forceGround = false;
  const spread = g.score - g.enemyScore >= ENEMY.wideSpawnLead ? ENEMY.spawnSpreadWide : ENEMY.spawnSpreadNarrow;
  let x = 0, z = 0;
  for (let i = 0; i < 64; i++) {
    const d = ENEMY.spawnDist * (g.rng() < 0.5 ? 0.5 : 1);
    const b = p.facing + (g.rng() * 2 - 1) * spread;
    x = wrapCoord(p.x + Math.sin(b) * d);
    z = wrapCoord(p.z + Math.cos(b) * d);
    if (kind === 'missile' || !obstacleAt(g, x, z)) break;
  }
  if (kind !== 'missile') return makeEnemy(kind, x, z, g.rng() * TAU);
  g.missilesLaunched++;
  const e = makeEnemy(kind, x, z, bearing(x, z, p.x, p.z));
  e.straight = g.missilesLaunched === 1;
  return e;
}

export function updateEnemy(g, e, dt) {
  e.age += dt;
  return e.kind === 'missile' ? updateMissile(g, e, dt) : updateTank(g, e, dt, ENEMY[e.kind]);
}

function move(e, d) {
  e.x = wrapCoord(e.x + Math.sin(e.facing) * d);
  e.z = wrapCoord(e.z + Math.cos(e.facing) * d);
  e.treadPhase += d;
}

function updateTank(g, e, dt, cfg) {
  const p = g.player;
  const toPlayer = bearing(e.x, e.z, p.x, p.z), d = dist(e.x, e.z, p.x, p.z);
  const aggressive = g.score - g.enemyScore >= ENEMY.aggressiveLead || g.score >= RULES.alwaysAggressiveScore;
  e.aimTimer -= dt;
  if (e.aimTimer <= 0) {
    // A 5K lead only shortens the re-aim. Random headings last until homingAfter either way.
    e.goal = e.age >= ENEMY.homingAfter ? toPlayer : g.rng() * TAU;
    e.aimTimer = aggressive ? ENEMY.aggressiveReaim : 1 + g.rng() * 3;
  }
  const ox = e.x, oz = e.z, wasReversing = e.reverseFor > 0;
  if (wasReversing) {
    e.reverseFor -= dt;
    move(e, -cfg.speed * dt);
  } else {
    const err = wrapAngle(e.goal - e.facing);
    const aligned = Math.abs(err) <= ENEMY.aimTolerance;
    const rate = (aligned ? cfg.turnSlow : cfg.turnFast) * dt;
    e.facing = wrapAngle(e.facing + clamp(err, -rate, rate));
    if (d > cfg.standoff) move(e, cfg.speed * dt);
  }
  if (unitBlocked(g, e.x, e.z, e)) {
    e.x = ox;
    e.z = oz;
    if (wasReversing) e.reverseFor = 0;
    else {
      e.reverseFor = ENEMY.reverseFor;
      e.goal = g.rng() * TAU;
      e.aimTimer = ENEMY.reverseFor;
    }
  }
  return { fire: wantsToFire(g, e, toPlayer, d, aggressive), gone: false };
}

function wantsToFire(g, e, toPlayer, d, aggressive) {
  if (!g.player.alive || e.age < ENEMY.noFireFor) return false;
  if (Math.abs(wrapAngle(toPlayer - e.facing)) > ENEMY.aimTolerance) return false;
  return aggressive || e.age >= ENEMY.alwaysFireAfter || g.score >= ENEMY.fireAnyScore || d < ENEMY.closeRange;
}

function updateMissile(g, e, dt) {
  const m = ENEMY.missile, p = g.player;
  const toPlayer = bearing(e.x, e.z, p.x, p.z), d = dist(e.x, e.z, p.x, p.z);
  e.y = Math.max(0, e.y - m.fallRate * dt);
  let heading = toPlayer;
  if (!e.straight && d > m.zigStopDist) {
    e.zigTimer -= dt;
    if (e.zigTimer <= 0) {
      e.zigSide = -e.zigSide;
      e.zigTimer = m.zigFlip;
    }
    heading += e.zigSide * m.zigAmp * Math.min(1, e.age / m.zigRamp);
  }
  e.facing = wrapAngle(heading);
  move(e, m.speed * dt); // ponytail: missiles ignore obstacles (ROM hops low ones)
  return { fire: false, gone: d > ENEMY.missileReplaceDist };
}

export function updateSaucer(g, dt) {
  const cfg = ENEMY.saucer, s = g.saucer;
  if (!s) {
    if (g.score < cfg.minScore || !g.player.alive) return;
    g.saucerDelay -= dt;
    if (g.saucerDelay > 0) return;
    const b = g.rng() * TAU, d = 6000 + g.rng() * 14000;
    g.saucer = {
      x: wrapCoord(g.player.x + Math.sin(b) * d), z: wrapCoord(g.player.z + Math.cos(b) * d),
      y: 0, vx: 0, vz: 0, retarget: 0, spin: 0, dying: 0,
    };
    return;
  }
  if (s.dying > 0) {
    s.dying -= dt;
    if (s.dying <= 0) {
      g.saucer = null;
      g.saucerDelay = g.rng() * cfg.delayMax;
    }
    return;
  }
  s.retarget -= dt;
  if (s.retarget <= 0) {
    s.vx = (g.rng() * 2 - 1) * cfg.maxVel;
    s.vz = (g.rng() * 2 - 1) * cfg.maxVel;
    s.retarget = g.rng() * cfg.retargetMax;
  }
  s.x = wrapCoord(s.x + s.vx * dt);
  s.z = wrapCoord(s.z + s.vz * dt);
  s.spin += dt * 2;
}
