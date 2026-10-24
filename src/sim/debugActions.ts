import { ENEMIES, type EnemyType } from '../config/enemies';
import { TILES, type Facing, type TileType } from '../config/tiles';
import { spawnRing } from './spawner';
import { cellFromId, cellId } from './grid';
import { cityChanged, type World } from './world';

/** Debug tooling (concept.md §8). Pure world mutations, bound to keys by the run scene. */

export function debugAddCoins(w: World, amount: number): void {
  w.coins += amount;
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
    board: [...w.city.board].map(cellFromId),
    tiles: w.city.tiles.map(({ type, gx, gy, hp, groupId }) => ({ type, gx, gy, hp, groupId })),
  });
}

/** Stress test: fills every empty board cell with tiles of `type` (one new group). */
export function debugFillGrid(w: World, type: TileType): void {
  const city = w.city;
  const groupId = city.nextGroupId++;
  const taken = new Set(city.tiles.map((t) => cellId(t.gx, t.gy)));
  for (const id of city.board) {
    if (taken.has(id)) continue;
    const { x: gx, y: gy } = cellFromId(id);
    {
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

/**
 * Debug: fills every empty board cell with weapons of every type in turn
 * (concept-v2.md §2.12), each facing away from the Core along its larger axis.
 */
export function debugFillWeapons(w: World): void {
  const city = w.city;
  const types = (Object.keys(TILES) as TileType[]).filter((t) => TILES[t].family === 'weapon');
  const taken = new Set(city.tiles.map((t) => cellId(t.gx, t.gy)));
  let i = 0;
  for (const id of city.board) {
    if (taken.has(id)) continue;
    const { x: gx, y: gy } = cellFromId(id);
    const type = types[i++ % types.length] as TileType;
    const facing: Facing = Math.abs(gx) > Math.abs(gy) ? (gx > 0 ? 1 : 3) : gy > 0 ? 2 : 0;
    city.tiles.push({
      id: city.nextTileId++,
      type,
      gx,
      gy,
      hp: TILES[type].maxHp,
      maxHp: TILES[type].maxHp,
      groupId: city.nextGroupId++,
      online: false,
      facing,
    });
    if (city.typeLevels[type] === 0) city.typeLevels[type] = 1;
  }
  cityChanged(w);
}

/** Kills the boss as if by a hit (to test the victory and endless quickly). */
export function debugKillBoss(w: World): void {
  if (w.boss) w.boss.dead = true;
}

/** Takes this share of the boss's max HP (to reach its later phases quickly). */
export function debugHurtBoss(w: World, fraction: number): void {
  const boss = w.boss;
  if (boss) boss.hp = Math.max(1, boss.hp - boss.maxHp * fraction);
}
