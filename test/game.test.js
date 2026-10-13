import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/game.js';
import { mulberry32 } from '../src/math.js';
import { PLAYER } from '../src/config.js';

const IDLE = { left: 0, right: 0, fire: false };
const FORWARD = { left: 1, right: 1, fire: false };
function run(g, input, seconds, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) events.push(...step(g, input, dt));
  return events;
}
const quiet = (opts = {}) => {
  const g = createGame({ rng: mulberry32(7), obstacles: [], ...opts });
  g.enemyDelay = Infinity; // keep enemies out of movement tests
  return g;
};

test('both treads forward drives straight ahead at full speed', () => {
  const g = quiet();
  run(g, FORWARD, 1);
  assert.ok(Math.abs(g.player.z - PLAYER.speed) < 1);
  assert.ok(Math.abs(g.player.x) < 1e-6);
});

test('left tread forward, right tread back pivots right in place', () => {
  const g = quiet();
  run(g, { left: 1, right: -1, fire: false }, 1);
  assert.ok(Math.abs(g.player.facing - PLAYER.turnRate) < 1e-6);
  assert.equal(g.player.x, 0);
  assert.equal(g.player.z, 0);
});

test('one tread alone moves at half speed while turning at half rate', () => {
  const g = quiet();
  run(g, { left: 1, right: 0, fire: false }, 0.5);
  assert.ok(Math.abs(g.player.facing - PLAYER.turnRate * 0.25) < 1e-6);
  assert.ok(g.player.z > 0 && g.player.z < PLAYER.speed * 0.5);
});

test('driving into an obstacle stops the tank and reports it once', () => {
  const g = quiet({ obstacles: [{ type: 1, x: 0, z: 1500, facing: 0 }] });
  const events = run(g, FORWARD, 1);
  assert.ok(g.player.z < 1500 - 832, 'never enters the obstacle radius');
  assert.equal(events.filter((e) => e.type === 'blocked').length, 1);
  assert.ok(g.blockedFor > 0);
});

test('driving off the world edge wraps to the other side', () => {
  const g = quiet();
  g.player.z = 32700;
  run(g, FORWARD, 0.1);
  assert.ok(g.player.z < -32000);
});

test('a huge frame time (tab was hidden) is clamped, not applied', () => {
  const g = quiet();
  step(g, FORWARD, 10);
  assert.ok(g.player.z <= PLAYER.speed * 0.05 + 1e-6);
});

import { makeEnemy } from '../src/ai.js';
import { SHELL, OBSTACLE, RULES } from '../src/config.js';
import { dist } from '../src/math.js';

const FIRE = { left: 0, right: 0, fire: true };
const enemyShellAtPlayer = (g) => g.shells.push({ owner: 'enemy', x: g.player.x, z: g.player.z + 2000, vx: 0, vz: -SHELL.speed, life: 1 });

test('only one player shell can be in flight', () => {
  const g = quiet();
  step(g, FIRE, 1 / 60);
  step(g, FIRE, 1 / 60);
  assert.equal(g.shells.filter((s) => s.owner === 'player').length, 1);
});

test('a tall box stops shells; a short box lets them pass over', () => {
  const tall = quiet({ obstacles: [{ type: 1, x: 0, z: 5000, facing: 0 }] });
  step(tall, FIRE, 1 / 60);
  const events = run(tall, IDLE, 0.5);
  assert.equal(tall.shells.length, 0);
  assert.ok(events.some((e) => e.type === 'shellBurst'));

  const short = quiet({ obstacles: [{ type: 15, x: 0, z: 5000, facing: 0 }] });
  step(short, FIRE, 1 / 60);
  run(short, IDLE, 0.5);
  assert.equal(short.shells.length, 1);
  assert.ok(short.shells[0].z > 6000);
});

test('shooting a tank scores 1000 and clears the enemy slot', () => {
  const g = quiet();
  g.enemy = makeEnemy('tank', 0, 6000, Math.PI);
  g.enemy.aimTimer = 100;
  step(g, FIRE, 1 / 60);
  const events = run(g, IDLE, 0.6);
  assert.equal(g.score, 1000);
  assert.equal(g.enemy, null);
  assert.ok(events.some((e) => e.type === 'enemyDestroyed' && e.kind === 'tank'));
  assert.ok(g.debris.length > 0);
});

test('a missile still high in the air cannot be shot', () => {
  const g = quiet();
  g.enemy = makeEnemy('missile', 0, 9000, Math.PI);
  g.enemy.straight = true;
  step(g, FIRE, 1 / 60);
  run(g, IDLE, 0.3);
  assert.equal(g.score, 0, 'shell passed under the descending missile');
});

test('crossing 15,000 and 100,000 each award a bonus tank', () => {
  const g = quiet();
  g.score = 14000;
  g.enemy = makeEnemy('tank', 0, 6000, Math.PI);
  g.enemy.aimTimer = 100;
  step(g, FIRE, 1 / 60);
  const events = run(g, IDLE, 0.6);
  assert.equal(g.lives, 4);
  assert.ok(events.some((e) => e.type === 'bonusTank' && !e.big));
});

test('an enemy shell kills the player, who stays dead for the pause, then respawns clear of obstacles', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = createGame({ rng: mulberry32(seed) }); // real ROM obstacle field
    g.enemyDelay = Infinity;
    enemyShellAtPlayer(g);
    const hit = run(g, IDLE, 0.2);
    assert.ok(hit.some((e) => e.type === 'playerHit'));
    assert.equal(g.player.alive, false);
    assert.equal(g.lives, 2);
    run(g, IDLE, 1.5);
    assert.equal(g.player.alive, false, `seed ${seed} respawned during the pause`);
    run(g, IDLE, RULES.deathPause);
    assert.equal(g.player.alive, true);
    assert.ok(!g.obstacles.some((o) => dist(g.player.x, g.player.z, o.x, o.z) < OBSTACLE.unitRadius[o.type]), `seed ${seed}`);
  }
});

test('a grounded missile reaching the player kills on contact', () => {
  const g = quiet();
  g.enemy = makeEnemy('missile', 0, 1500, Math.PI);
  g.enemy.y = 0;
  g.enemy.straight = true;
  run(g, IDLE, 0.2);
  assert.equal(g.player.alive, false);
  assert.equal(g.enemy, null);
});

test('losing the last tank ends the game and freezes the score', () => {
  const g = quiet({ lives: 1 });
  enemyShellAtPlayer(g);
  const events = run(g, IDLE, 3.5);
  assert.equal(g.over, true);
  assert.ok(events.some((e) => e.type === 'gameOver'));
  const before = JSON.stringify(g.player);
  run(g, FORWARD, 1);
  assert.equal(JSON.stringify(g.player), before);
});
