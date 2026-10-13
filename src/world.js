import { OBSTACLE, PLAYER } from './config.js';
import { dist, wrapCoord } from './math.js';

export const obstacleAt = (g, x, z) => g.obstacles.some((o) => dist(x, z, o.x, o.z) < OBSTACLE.unitRadius[o.type]);

export function unitBlocked(g, x, z, self) {
  if (obstacleAt(g, x, z)) return 'obstacle';
  const other = self === g.player ? (g.enemy?.kind === 'missile' ? null : g.enemy) : g.player.alive ? g.player : null;
  return other && dist(x, z, other.x, other.z) < PLAYER.collideRadius ? 'unit' : null;
}

export const shellHitsObstacle = (g, x, z) => g.obstacles.some((o) => dist(x, z, o.x, o.z) < OBSTACLE.shellRadius[o.type]);

export function randomClearSpot(g) {
  for (let i = 0; i < 200; i++) {
    const x = wrapCoord((g.rng() - 0.5) * 65536), z = wrapCoord((g.rng() - 0.5) * 65536);
    if (!obstacleAt(g, x, z)) return { x, z };
  }
  return { x: 0, z: 0 }; // ponytail: (0,0) is clear in the ROM layout
}
