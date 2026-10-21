import { ENEMIES, type EnemyType } from '../config/enemies';
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

/** Spawns `count` enemies of a type on the ring; a boss type spawns once (if none is alive). */
export function debugSpawn(w: World, type: EnemyType, count: number): void {
  if (ENEMIES[type].boss) {
    if (!w.boss) spawnRing(w, type, 1);
    return;
  }
  spawnRing(w, type, count);
}

/** Removes all enemies except the boss, without drops. */
export function debugKillAll(w: World): void {
  w.enemyPool.push(...w.enemies.filter((e) => e !== w.boss));
  w.enemies.length = 0;
  if (w.boss) w.enemies.push(w.boss);
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
  // Spike B2: fills every empty board cell.
  for (const key of city.board) {
    const [gx = 0, gy = 0] = key.split(',').map(Number);
    {
      if (taken.has(`${gx},${gy}`)) continue;
      city.tiles.push({
        id: city.nextTileId++,
        type,
        gx,
        gy,
        hp: TILES[type].maxHp,
        maxHp: TILES[type].maxHp,
        groupId,
        online: false,
        facing: 0,
      });
    }
  }
  if (city.typeLevels[type] === 0) city.typeLevels[type] = 1;
  cityChanged(w);
}

/** Takes this share of the boss's max HP (to reach its later phases quickly). */
export function debugHurtBoss(w: World, fraction: number): void {
  const boss = w.boss;
  if (boss) boss.hp = Math.max(1, boss.hp - boss.maxHp * fraction);
}
