import type { EnemyType } from '../config/enemies';
import { addXp, xpToNext } from './progression';
import { spawnRing } from './spawner';
import type { World } from './world';

/** Debug tooling (concept.md §8). Pure world mutations, bound to keys by the run scene. */

export function debugLevelUp(w: World): void {
  addXp(w, xpToNext(w.level) - w.xp);
}

export function debugAddTime(w: World, seconds: number): void {
  w.time += seconds;
}

export function debugSpawn(w: World, type: EnemyType, count: number): void {
  spawnRing(w, type, count);
}

/** Removes all enemies without drops. */
export function debugKillAll(w: World): void {
  w.enemyPool.push(...w.enemies);
  w.enemies.length = 0;
}

export function debugLayoutJson(w: World): string {
  return JSON.stringify({
    gridSize: w.city.gridSize,
    tiles: w.city.tiles.map(({ type, gx, gy, hp, groupId }) => ({ type, gx, gy, hp, groupId })),
  });
}
