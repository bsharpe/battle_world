import { OBSTACLES } from './data/rom.js';
import { PLAYER, ENEMY, RULES, MESSAGES } from './config.js';
import { wrapAngle, wrapCoord } from './math.js';
import { unitBlocked } from './world.js';

const MAX_DT = 0.05;

export function createGame({ rng = Math.random, obstacles = OBSTACLES, lives = RULES.lives } = {}) {
  return {
    rng, obstacles, lives,
    score: 0, enemyScore: 0, bonusIdx: 0, time: 0, over: false,
    player: { x: 0, z: 0, facing: 0, alive: true, deadFor: 0 },
    enemy: null, enemyDelay: ENEMY.spawnDelay, forceGround: false, missilesLaunched: 0,
    saucer: null, saucerDelay: rng() * ENEMY.saucer.delayMax,
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
  if (g.over) return g.events;
  if (g.player.alive) movePlayer(g, input, dt);
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
