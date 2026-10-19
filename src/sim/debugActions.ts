import type { EnemyType } from '../config/enemies';
import { TILES, type TileType } from '../config/tiles';
import { addXp, xpToNext } from './progression';
import { spawnRing } from './spawner';
import { cityChanged, type World } from './world';

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

/** Stress test: fills every empty cell with tiles of `type` (one new group). */
export function debugFillGrid(w: World, type: TileType): void {
  const city = w.city;
  const groupId = city.nextGroupId++;
  const taken = new Set(city.tiles.map((t) => `${t.gx},${t.gy}`));
  for (let gy = 0; gy < city.gridSize; gy++) {
    for (let gx = 0; gx < city.gridSize; gx++) {
      if (taken.has(`${gx},${gy}`)) continue;
      city.tiles.push({
        id: city.nextTileId++,
        type,
        gx,
        gy,
        hp: TILES[type].maxHp,
        groupId,
        online: false,
        facing: 0,
      });
    }
  }
  if (city.typeLevels[type] === 0) city.typeLevels[type] = 1;
  cityChanged(w);
}
