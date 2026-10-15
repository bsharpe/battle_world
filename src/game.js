import { OBSTACLES } from './data/rom.js';
import { PLAYER, SHELL, ENEMY, UFO_KEY, RULES, MESSAGES } from './config.js';
import { TAU, wrapAngle, wrapCoord, dist } from './math.js';
import { unitBlocked, shellHitsObstacle, randomClearSpot } from './world.js';
import { spawnEnemy, updateEnemy, updateSaucer } from './ai.js';

const MAX_DT = 0.05;
const GRAVITY = 6000;
const CHUNKS = {
  tank: ['chunk10', 'chunk11', 'chunk12', 'chunk13', 'chunk14', 'chunk15'],
  super: ['chunk10', 'chunk11', 'chunk12', 'chunk14', 'chunk15'],
  missile: ['chunk18', 'chunk19', 'chunk1a', 'chunk1b', 'chunk1c', 'chunk1d'],
  // Same small wedge four times: the saucer has no wreck shape of its own.
  saucer: ['chunk13', 'chunk13', 'chunk13', 'chunk13'],
};
const BURST_TIME = 0.48;

export function createGame({ rng = Math.random, obstacles = OBSTACLES, lives = RULES.lives } = {}) {
  return {
    rng, obstacles, lives,
    score: 0, enemyScore: 0, bonusIdx: 0, time: 0, over: false,
    player: { x: 0, z: 0, facing: 0, alive: true, deadFor: 0 },
    enemy: null, enemyDelay: ENEMY.spawnDelay, forceGround: false, missilesLaunched: 0,
    saucers: [], saucerDelay: rng() * ENEMY.saucer.delayMax,
    shells: [], debris: [],
    blockedFor: 0, jolt: 0, events: [],
  };
}

export function step(g, input, dt) {
  dt = Math.min(dt, MAX_DT);
  g.events = [];
  g.time += dt;
  g.blockedFor = Math.max(0, g.blockedFor - dt);
  g.jolt *= Math.exp(-dt * 12);
  updateDebris(g, dt);
  if (g.over) return g.events;
  if (g.player.alive) {
    movePlayer(g, input, dt);
    if (input.fire) fireShell(g, g.player, 'player');
    if (input.ufo) spawnUfo(g);
  } else updateDeath(g, dt);
  updateEnemySlot(g, dt);
  updateSaucer(g, dt);
  updateShells(g, dt);
  // killPlayer's clear is lost when it runs inside the shells filter.
  if (!g.player.alive) g.shells = [];
  return g.events;
}

function movePlayer(g, input, dt) {
  const p = g.player;
  const forward = (input.left + input.right) / 2, turn = (input.left - input.right) / 2;
  p.facing = wrapAngle(p.facing + turn * PLAYER.turnRate * dt);
  if (!forward) return;
  const d = forward * PLAYER.speed * dt;
  const nx = wrapCoord(p.x + Math.sin(p.facing) * d), nz = wrapCoord(p.z + Math.cos(p.facing) * d);
  if (unitBlocked(g, nx, nz, p)) {
    if (g.blockedFor === 0) g.events.push({ type: 'blocked' });
    g.blockedFor = MESSAGES.blockedShow;
    g.jolt = Math.max(g.jolt, 0.5);
    return;
  }
  p.x = nx;
  p.z = nz;
}

function fireShell(g, u, owner) {
  if (g.shells.some((s) => s.owner === owner)) return;
  const sx = Math.sin(u.facing), sz = Math.cos(u.facing);
  g.shells.push({
    owner,
    x: wrapCoord(u.x + sx * SHELL.muzzle), z: wrapCoord(u.z + sz * SHELL.muzzle),
    vx: sx * SHELL.speed, vz: sz * SHELL.speed, life: SHELL.life,
  });
  g.events.push({ type: 'fire', owner });
}

function updateEnemySlot(g, dt) {
  if (!g.player.alive) return; // the world holds still while the windshield is cracked
  if (!g.enemy) {
    g.enemyDelay -= dt;
    if (g.enemyDelay <= 0) {
      g.enemy = spawnEnemy(g);
      g.events.push({ type: 'enemySpawn', kind: g.enemy.kind });
    }
    return;
  }
  const { fire, gone } = updateEnemy(g, g.enemy, dt);
  if (gone) {
    g.enemy = null;
    g.enemyDelay = 0;
    return;
  }
  if (fire) fireShell(g, g.enemy, 'enemy');
  const e = g.enemy, m = ENEMY.missile;
  if (e.kind === 'missile' && e.y < m.hittableBelow && dist(e.x, e.z, g.player.x, g.player.z) < m.contactRadius) {
    spawnDebris(g, e);
    g.enemy = null;
    killPlayer(g);
  }
}

function updateShells(g, dt) {
  g.shells = g.shells.filter((s) => {
    s.life -= dt;
    if (s.life <= 0) return false;
    const n = Math.ceil((SHELL.speed * dt) / SHELL.maxSubstep), h = dt / n;
    for (let i = 0; i < n; i++) {
      s.x = wrapCoord(s.x + s.vx * h);
      s.z = wrapCoord(s.z + s.vz * h);
      if (shellHitsObstacle(g, s.x, s.z)) {
        g.events.push({ type: 'shellBurst', x: s.x, z: s.z });
        return false;
      }
      if (s.owner === 'player') {
        const e = g.enemy;
        if (e && dist(s.x, s.z, e.x, e.z) < ENEMY.hitRadius && (e.kind !== 'missile' || e.y < ENEMY.missile.hittableBelow)) {
          destroyEnemy(g);
          return false;
        }
        const u = g.saucers.find((q) => dist(s.x, s.z, q.x, q.z) < ENEMY.hitRadius);
        if (u) {
          destroySaucer(g, u);
          return false;
        }
      } else if (g.player.alive && dist(s.x, s.z, g.player.x, g.player.z) < PLAYER.hitRadius) {
        killPlayer(g);
        return false;
      }
    }
    return true;
  });
}

function spawnUfo(g) {
  if (g.saucers.length >= UFO_KEY.max) return;
  const p = g.player, b = p.facing + (g.rng() * 2 - 1) * UFO_KEY.spread;
  const d = UFO_KEY.near + g.rng() * (UFO_KEY.far - UFO_KEY.near);
  g.saucers.push({ x: wrapCoord(p.x + Math.sin(b) * d), z: wrapCoord(p.z + Math.cos(b) * d), y: 0, vx: 0, vz: 0, retarget: 0, spin: 0 });
}

function destroySaucer(g, u) {
  spawnDebris(g, { kind: 'saucer', x: u.x, y: u.y, z: u.z });
  g.debris.push({ burst: true, frame: 0, x: u.x, y: u.y, z: u.z, life: BURST_TIME });
  addScore(g, ENEMY.saucer.score);
  g.events.push({ type: 'saucerHit' });
  g.saucers = g.saucers.filter((s) => s !== u);
  g.saucerDelay = g.rng() * ENEMY.saucer.delayMax;
}

function destroyEnemy(g) {
  const e = g.enemy;
  addScore(g, ENEMY[e.kind].score);
  spawnDebris(g, e);
  g.events.push({ type: 'enemyDestroyed', kind: e.kind, x: e.x, z: e.z });
  g.enemy = null;
  g.enemyDelay = ENEMY.spawnDelay;
}

function addScore(g, points) {
  g.score += points;
  while (g.bonusIdx < RULES.bonusAt.length && g.score >= RULES.bonusAt[g.bonusIdx]) {
    g.bonusIdx++;
    g.lives++;
    g.events.push({ type: 'bonusTank', big: g.bonusIdx === RULES.bonusAt.length });
  }
}

function killPlayer(g) {
  const p = g.player;
  p.alive = false;
  p.deadFor = 0;
  g.lives--;
  g.enemyScore += RULES.enemyKillBonus;
  g.jolt = 1;
  g.shells = [];
  g.events.push({ type: 'playerHit' });
}

function updateDeath(g, dt) {
  const p = g.player;
  p.deadFor += dt;
  if (p.deadFor < RULES.deathPause) return;
  if (g.lives <= 0) {
    g.over = true;
    g.events.push({ type: 'gameOver' });
    return;
  }
  Object.assign(p, randomClearSpot(g), { facing: g.rng() * TAU, alive: true, deadFor: 0 });
  g.enemy = null; // a live enemy is replaced; a missile becomes a ground unit
  g.forceGround = true;
  g.enemyDelay = ENEMY.respawnHold;
}

function spawnDebris(g, e) {
  for (const shape of CHUNKS[e.kind]) {
    g.debris.push({
      shape, kind: e.kind, x: e.x, y: e.y, z: e.z,
      vx: (g.rng() - 0.5) * 3000, vy: 1500 + g.rng() * 2500, vz: (g.rng() - 0.5) * 3000,
      facing: g.rng() * TAU, spin: (g.rng() - 0.5) * 8, life: 2,
    });
  }
}

function updateDebris(g, dt) {
  g.debris = g.debris.filter((d) => {
    d.life -= dt;
    if (d.burst) {
      d.frame = Math.min(7, Math.floor((BURST_TIME - Math.max(d.life, 0)) / (BURST_TIME / 8)));
      return d.life > 0;
    }
    d.vy -= GRAVITY * dt;
    d.x = wrapCoord(d.x + d.vx * dt);
    d.y = Math.max(0, d.y + d.vy * dt);
    d.z = wrapCoord(d.z + d.vz * dt);
    d.facing += d.spin * dt; // ROM chunks spin about Y only
    return d.life > 0;
  });
}
