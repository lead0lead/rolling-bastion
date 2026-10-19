import { GRID, LEVEL_UP, MOVE } from '../config/balance';
import type { EnemyType } from '../config/enemies';
import { TILES, type TileType } from '../config/tiles';
import type { SpawnGroupId } from '../config/waves';
import { updateOnline } from './connectivity';
import { createCity, type CityState, type PlacedTile } from './grid';
import { createRng, type Rng } from './rng';
import { SpatialHash } from './spatialHash';

export interface Enemy {
  type: EnemyType;
  x: number;
  y: number;
  /** Position at the start of the tick, for render interpolation. */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  /** Knockback velocity (px/s), decays over time. */
  kvx: number;
  kvy: number;
  /** Game time of the last hit (for the hit flash). */
  hitTime: number;
  dead: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  knockback: number;
  life: number;
  /** Tile type that fired it (for visuals). */
  source: TileType;
  dead: boolean;
}

/** Per-weapon-tile state. `aim` is the barrel angle (rad) the renderer turns toward. */
export interface WeaponState {
  cooldown: number;
  aim: number;
  aimTimer: number;
}

export interface Gem {
  x: number;
  y: number;
  value: number;
}

export type WorldEvent =
  | { kind: 'tileDestroyed'; x: number; y: number; type: TileType }
  | { kind: 'enemyKilled'; x: number; y: number; type: EnemyType }
  | { kind: 'levelUp'; level: number };

/** City-derived data, recomputed only when the city changes (concept.md §9). */
export interface CityCache {
  /** Tile per cell, row-major, `gridSize²` entries. */
  cells: (PlacedTile | undefined)[];
  /** Tile centres relative to the city origin (grid centre). */
  centres: { tile: PlacedTile; rx: number; ry: number }[];
  /** Bounding box of tile centres, relative to the origin. */
  minRx: number;
  maxRx: number;
  minRy: number;
  maxRy: number;
  /** Online tiles that have a weapon. */
  weapons: PlacedTile[];
  /** Movement speed as a fraction of base. */
  speedFactor: number;
}

export interface World {
  time: number;
  rng: Rng;
  city: CityState;
  cache: CityCache;
  /** World position of the grid centre, and its velocity. */
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  enemies: Enemy[];
  projectiles: Projectile[];
  gems: Gem[];
  enemyPool: Enemy[];
  projectilePool: Projectile[];
  hash: SpatialHash;
  spawn: { budget: number; next: { id: SpawnGroupId; count: number } | null; spikeIndex: number };
  /** State of each weapon tile, by tile id. */
  weapons: Map<number, WeaponState>;
  xp: number;
  level: number;
  pendingLevelUps: number;
  rerolls: number;
  kills: number;
  /** Half-diagonal of the visible area in world px; set by the renderer. */
  viewRadius: number;
  godMode: boolean;
  over: boolean;
  /** Things that happened this tick, for the renderer to consume. */
  events: WorldEvent[];
}

export function createWorld(seed: number): World {
  const city = createCity();
  updateOnline(city);
  const world: World = {
    time: 0,
    rng: createRng(seed),
    city,
    cache: buildCache(city),
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    enemies: [],
    projectiles: [],
    gems: [],
    enemyPool: [],
    projectilePool: [],
    hash: new SpatialHash(GRID.cellPx),
    spawn: { budget: 0, next: null, spikeIndex: 0 },
    weapons: new Map(),
    xp: 0,
    level: 1,
    pendingLevelUps: 0,
    rerolls: LEVEL_UP.rerollsPerRun,
    kills: 0,
    viewRadius: 1000,
    godMode: false,
    over: false,
    events: [],
  };
  return world;
}

/** Call after any change to the city's tiles (destruction, build pause). */
export function cityChanged(w: World): void {
  updateOnline(w.city);
  w.cache = buildCache(w.city);
}

function buildCache(city: CityState): CityCache {
  const cell = GRID.cellPx;
  const half = (city.gridSize * cell) / 2;
  const cells: (PlacedTile | undefined)[] = new Array(city.gridSize * city.gridSize);
  const centres: CityCache['centres'] = [];
  const weapons: PlacedTile[] = [];
  let minRx = Infinity;
  let maxRx = -Infinity;
  let minRy = Infinity;
  let maxRy = -Infinity;
  let engines = 0;
  for (const t of city.tiles) {
    cells[t.gy * city.gridSize + t.gx] = t;
    const rx = (t.gx + 0.5) * cell - half;
    const ry = (t.gy + 0.5) * cell - half;
    centres.push({ tile: t, rx, ry });
    minRx = Math.min(minRx, rx);
    maxRx = Math.max(maxRx, rx);
    minRy = Math.min(minRy, ry);
    maxRy = Math.max(maxRy, ry);
    if (!t.online) continue;
    if (TILES[t.type].weapon) weapons.push(t);
    if (t.type === 'engine') engines++;
  }
  if (centres.length === 0) minRx = maxRx = minRy = maxRy = 0;
  const penalty = Math.max(0, city.tiles.length - MOVE.penaltyFreeTiles) * MOVE.penaltyPerTile;
  const speedFactor = Math.max(MOVE.minSpeedFactor, 1 - penalty) + engines * MOVE.engineBonus;
  return { cells, centres, minRx, maxRx, minRy, maxRy, weapons, speedFactor };
}

/** World x of the grid's left edge and y of its top edge. */
export function gridTopLeft(w: World): { left: number; top: number } {
  const half = (w.city.gridSize * GRID.cellPx) / 2;
  return { left: w.x - half, top: w.y - half };
}

export function tileAtCell(w: World, gx: number, gy: number): PlacedTile | undefined {
  const n = w.city.gridSize;
  if (gx < 0 || gy < 0 || gx >= n || gy >= n) return undefined;
  return w.cache.cells[gy * n + gx];
}

export function tileCentre(w: World, t: PlacedTile): { x: number; y: number } {
  const half = (w.city.gridSize * GRID.cellPx) / 2;
  return { x: w.x + (t.gx + 0.5) * GRID.cellPx - half, y: w.y + (t.gy + 0.5) * GRID.cellPx - half };
}

/** World position of the centre of the city's occupied area. */
export function cityCentre(w: World): { x: number; y: number } {
  const c = w.cache;
  return { x: w.x + (c.minRx + c.maxRx) / 2, y: w.y + (c.minRy + c.maxRy) / 2 };
}
