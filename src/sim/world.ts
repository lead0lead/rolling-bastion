import { GRID, LEVEL_UP } from '../config/balance';
import { BOSS, type EnemyType } from '../config/enemies';
import { TILES, type TileType } from '../config/tiles';
import type { SpawnGroupId } from '../config/waves';
import { findBridges, updateOnline } from './connectivity';
import { createCity, type CityState, type PlacedTile } from './grid';
import { createRng, type Rng } from './rng';
import { SpatialHash } from './spatialHash';
import { applyMaxHp, computeSynergies, type Synergies, type TileMods } from './synergies';

export interface Enemy {
  type: EnemyType;
  x: number;
  y: number;
  /** Position at the start of the tick, for render interpolation. */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  /** Collision radius (px); larger for elites. */
  radius: number;
  /** XP dropped on death. */
  xp: number;
  elite: boolean;
  /** Seconds until a ranged enemy may shoot again. */
  cooldown: number;
  /** Died without being killed (a Bomber that blew up): no gem, no kill. */
  noDrop: boolean;
  /** Knockback velocity (px/s), decays over time. */
  kvx: number;
  kvy: number;
  /** Game time of the last hit (for the hit flash). */
  hitTime: number;
  /** Speed factor from touching a slowing tile last tick (1 = none). */
  slow: number;
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
  /** Lobbed shell: explodes with this radius where its life ends (0 = hits the first enemy). */
  blast: number;
  /** Enemies it may still pass through. */
  pierce: number;
  /** Enemies already hit (piercing shots hit each enemy once). */
  hits: Enemy[];
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

/** A Spitter shot: flies straight and hits the first tile it reaches. */
export interface EnemyShot {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  dead: boolean;
}

export interface Gem {
  x: number;
  y: number;
  value: number;
  /** Pulled in by a Magnet L5 recall; flies to the city until collected. */
  pulled?: boolean;
}

export type WorldEvent =
  | { kind: 'tileDestroyed'; x: number; y: number; type: TileType }
  | { kind: 'enemyKilled'; x: number; y: number; type: EnemyType }
  | { kind: 'blast'; x: number; y: number; radius: number; bomb: boolean }
  | { kind: 'levelUp'; level: number }
  | { kind: 'gridExpanded'; size: number }
  | { kind: 'bossPhase'; phase: number };

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
  /** Bridge tiles (Sapper targets) and their centres relative to the origin. */
  bridges: Set<number>;
  bridgeCentres: { rx: number; ry: number }[];
  /** Levels, buffs and bonuses per tile, plus city-wide effects. */
  syn: Synergies;
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
  enemyShots: EnemyShot[];
  gems: Gem[];
  enemyPool: Enemy[];
  projectilePool: Projectile[];
  enemyShotPool: EnemyShot[];
  hash: SpatialHash;
  spawn: { budget: number; next: { id: SpawnGroupId; count: number } | null; spikeIndex: number };
  /** Seconds until the next Magnet L5 recall. */
  gemPullTimer: number;
  /** State of each weapon tile, by tile id. */
  weapons: Map<number, WeaponState>;
  xp: number;
  level: number;
  pendingLevelUps: number;
  /** Timed grid expansions done so far, and free build pauses still to open for them. */
  expansions: number;
  pendingExpansions: number;
  /** Game time of the last grid expansion (for the banner). */
  expandedAt: number;
  /** The live boss, if any; checked outside the spatial hash (it is too big for it). */
  boss: Enemy | null;
  bossSpawned: boolean;
  bossState: BossState;
  /** The boss was defeated: the run is won. */
  won: boolean;
  /** Grid cell where the Core was destroyed (for the end screen), or null. */
  coreLostAt: { gx: number; gy: number } | null;
  /** Damage dealt to enemies per tile type (for balance stats). */
  damageBy: Partial<Record<TileType, number>>;
  /**
   * Running counts the renderer compares between frames to play sounds,
   * without allocating an event per shot: weapon volleys per tile type,
   * gem pickups (ticks with any), enemy shots fired.
   */
  tally: { shots: Partial<Record<TileType, number>>; gems: number; enemyShots: number };
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
    enemyShots: [],
    gems: [],
    enemyPool: [],
    projectilePool: [],
    enemyShotPool: [],
    hash: new SpatialHash(GRID.cellPx),
    spawn: { budget: 0, next: null, spikeIndex: 0 },
    weapons: new Map(),
    gemPullTimer: 0,
    xp: 0,
    level: 1,
    pendingLevelUps: 0,
    expansions: 0,
    pendingExpansions: 0,
    expandedAt: -Infinity,
    boss: null,
    bossSpawned: false,
    bossState: newBossState(),
    won: false,
    coreLostAt: null,
    damageBy: {},
    tally: { shots: {}, gems: 0, enemyShots: 0 },
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

/** The Colossus's phase and attack timers (concept.md §4.3). */
export interface BossState {
  phase: 1 | 2 | 3;
  /** Game time of the last phase change (for the banner). */
  phaseAt: number;
  addTimer: number;
  volleyTimer: number;
  /** Phase 3 charge cycle: walking (resting), showing the telegraph, or dashing. */
  charge: 'walk' | 'telegraph' | 'dash';
  chargeTimer: number;
  /** Charge direction (unit vector). */
  dirX: number;
  dirY: number;
}

export function newBossState(): BossState {
  return {
    phase: 1,
    phaseAt: -Infinity,
    addTimer: BOSS.addInterval[0],
    volleyTimer: BOSS.volley.interval,
    charge: 'walk',
    chargeTimer: 0,
    dirX: 1,
    dirY: 0,
  };
}

/** The boss enrages if still alive at BOSS.enrageAt (concept.md §2.6). */
export function bossEnraged(w: World): boolean {
  return w.boss !== null && w.time >= BOSS.enrageAt;
}

/** Tile modifiers; falls back to neutral values for a tile not in the cache. */
export function modsOf(w: World, t: PlacedTile): TileMods {
  return w.cache.syn.mods.get(t.id) ?? NEUTRAL_MODS;
}

const NEUTRAL_MODS: TileMods = {
  damage: 1,
  fireRate: 1,
  damageTaken: 1,
  contactTaken: 1,
  heal: 0,
  regen: 0,
  maxHp: 0,
  thorns: 0,
  slow: 1,
  reflect: 0,
  chainBonus: 0,
};

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
  const syn = computeSynergies(city);
  applyMaxHp(city, syn);
  const bridges = findBridges(city);
  const bridgeCentres: CityCache['bridgeCentres'] = [];
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
    if (bridges.has(t.id)) bridgeCentres.push({ rx, ry });
  }
  if (centres.length === 0) minRx = maxRx = minRy = maxRy = 0;
  return { cells, centres, minRx, maxRx, minRy, maxRy, weapons, bridges, bridgeCentres, syn };
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
