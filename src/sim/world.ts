import { GRID, LEVEL_UP } from '../config/balance';
import { roundBudget } from './endless';
import { BOSS, type EnemyType } from '../config/enemies';
import { ECONOMY } from '../config/economy';
import { TILES, type TileType } from '../config/tiles';
import type { SpawnGroupId } from '../config/waves';
import { findBridges, updateOnline } from './connectivity';
import { cellId, createCity, type CityState, type PlacedTile } from './grid';
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
  /** Coins paid on death. */
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
  /** Game time each status ends (concept-v2.md §2.12); in the past = not active. */
  burnUntil: number;
  snagUntil: number;
  staggerUntil: number;
  markUntil: number;
  /** Burn damage per second while burning. */
  burnDps: number;
  /** Multiplier on its contact, shot and bomb damage (endless growth, concept-v2.md §2.11). */
  damageFactor: number;
  /** Coins a Thief carries off (paid back doubled if it is killed), and whether it is running away. */
  loot: number;
  fleeing: boolean;
  /** Blob generation (0 = the original); for a Disco Robot, the beat count. */
  gen: number;
  dead: boolean;
}

/** A drone from a Drone Hangar: circles the city and shoots enemies. */
export interface Drone {
  /** Id of the hangar that launched it. */
  home: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Orbit / attack angle (rad). */
  angle: number;
  cooldown: number;
}

/** A black hole: drags enemies within `radius` toward its centre for `life` more seconds and deals `dps`. */
export interface Hole {
  x: number;
  y: number;
  radius: number;
  pull: number;
  dps: number;
  life: number;
  maxLife: number;
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
  /** Game time of the last shot (for flame cones and muzzle effects). */
  firedAt?: number;
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

export type WorldEvent =
  | { kind: 'tileDestroyed'; x: number; y: number; type: TileType; brokeOff?: boolean }
  | { kind: 'zap'; pts: number[] }
  | { kind: 'streak'; label: string; count: number }
  | { kind: 'domeBreak'; x: number; y: number; radius: number }
  | { kind: 'steal'; x: number; y: number; amount: number }
  | { kind: 'discoBeat'; x: number; y: number; strike: boolean }
  | { kind: 'droneLaunch' }
  | { kind: 'enemyKilled'; x: number; y: number; type: EnemyType }
  | { kind: 'blast'; x: number; y: number; radius: number; bomb: boolean; source?: TileType }
  | { kind: 'levelUp'; level: number }
  | { kind: 'bossPhase'; phase: number };

/** City-derived data, recomputed only when the city changes (concept.md §9). */
export interface CityCache {
  /** Tile per cell, by `cellId` (sparse: the grid is open-ended). */
  cells: Map<number, PlacedTile>;
  /** Tile centres relative to the city origin (the centre of cell (0, 0), the Core's). */
  centres: { tile: PlacedTile; rx: number; ry: number }[];
  /** Bounding box of tile centres, relative to the origin. */
  minRx: number;
  maxRx: number;
  minRy: number;
  maxRy: number;
  /** Online tiles that have a weapon. */
  weapons: PlacedTile[];
  /** Online tiles by type (for the gadget tiles). */
  online: Partial<Record<TileType, PlacedTile[]>>;
  /** Farthest tile centre from the middle of the bounding box (px): the dome's inner radius. */
  reach: number;
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
  /** World position of the centre of cell (0, 0) (the Core's cell), and its velocity. */
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  enemies: Enemy[];
  projectiles: Projectile[];
  enemyShots: EnemyShot[];
  enemyPool: Enemy[];
  projectilePool: Projectile[];
  enemyShotPool: EnemyShot[];
  hash: SpatialHash;
  /** The round's spawning (concept-v2.md §2.16): bank, total and unspawned budget, the next group, and whether all has spawned. */
  spawn: {
    budget: number;
    total: number;
    left: number;
    next: { id: SpawnGroupId; count: number } | null;
    done: boolean;
  };
  /** The current round (1-based), and whether it is over: everything spawned and dead, time to shop. */
  round: number;
  roundClear: boolean;
  /** State of each weapon tile, by tile id. */
  weapons: Map<number, WeaponState>;
  drones: Drone[];
  /** Seconds until each Drone Hangar (by tile id) launches its next drone. */
  hangarTimers: Record<number, number>;
  holes: Hole[];
  /** The Dome Emitters' shared bubble: HP, total max HP, game time of the last hit, and when a broken dome is back (0 = up). */
  dome: { hp: number; max: number; hitAt: number; downUntil: number };
  /** Kill streak: kills in a row, game time of the last, and the highest announced tier (−1 = none). */
  streak: { count: number; at: number; tier: number };
  /** Coins to spend in the shop (concept-v2.md §2.13), and all coins picked up so far. */
  coins: number;
  coinsEarned: number;
  /** Game time the city last took damage, and the adaptive pressure it builds up (§2.14). */
  lastHitAt: number;
  pressure: number;
  /** Lands bought so far (each costs more). */
  landsBought: number;
  xp: number;
  level: number;
  pendingLevelUps: number;
  /** Of the pending level-ups, how many also offer land (concept-v2.md §2.1). */
  pendingLand: number;
  /** The live boss, if any; checked outside the spatial hash (it is too big for it). */
  boss: Enemy | null;
  bossSpawned: boolean;
  /** Game time the current (or last) boss arrived; enrage counts from here. */
  bossSpawnedAt: number;
  bossState: BossState;
  /** The boss was defeated: the run is won. */
  won: boolean;
  /** Round in which the player chose "Keep going" (concept-v2.md §2.11), or null. */
  endlessSince: number | null;
  /** Colossi that returned in endless so far. */
  bossReturns: number;
  /** Colossi defeated, the first boss included. */
  bossKills: number;
  /** Grid cell where the Core was destroyed (for the end screen), or null. */
  coreLostAt: { gx: number; gy: number } | null;
  /** Damage dealt to enemies per tile type (for balance stats). */
  damageBy: Partial<Record<TileType, number>>;
  /**
   * Running counts the renderer compares between frames to play sounds,
   * without allocating an event per shot: weapon volleys per tile type,
   * ticks with coins earned (`gems`), enemy shots fired.
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
    enemyPool: [],
    projectilePool: [],
    enemyShotPool: [],
    hash: new SpatialHash(GRID.cellPx),
    spawn: { budget: 0, total: roundBudget(1), left: roundBudget(1), next: null, done: false },
    round: 1,
    roundClear: false,
    weapons: new Map(),
    drones: [],
    hangarTimers: {},
    holes: [],
    dome: { hp: 0, max: 0, hitAt: -Infinity, downUntil: 0 },
    streak: { count: 0, at: -Infinity, tier: -1 },
    coins: ECONOMY.startCoins,
    coinsEarned: 0,
    lastHitAt: 0,
    pressure: 0,
    landsBought: 0,
    xp: 0,
    level: 1,
    pendingLevelUps: 0,
    pendingLand: 0,
    boss: null,
    bossSpawned: false,
    bossSpawnedAt: 0,
    bossState: newBossState(),
    won: false,
    endlessSince: null,
    bossReturns: 0,
    bossKills: 0,
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

/**
 * The boss enrages if still alive BOSS.enrageAfter seconds after it arrived
 * (concept.md §2.6).
 */
export function bossEnraged(w: World): boolean {
  return w.boss !== null && w.time >= w.bossSpawnedAt + BOSS.enrageAfter;
}

/** Tile modifiers; falls back to neutral values for a tile not in the cache. */
export function modsOf(w: World, t: PlacedTile): TileMods {
  return w.cache.syn.mods.get(t.id) ?? NEUTRAL_MODS;
}

const NEUTRAL_MODS: TileMods = {
  damage: 1,
  fireRate: 1,
  contactTaken: 1,
  regen: 0,
  maxHp: 0,
  chainBonus: 0,
};

function buildCache(city: CityState): CityCache {
  const cell = GRID.cellPx;
  const cells = new Map<number, PlacedTile>();
  const centres: CityCache['centres'] = [];
  const weapons: PlacedTile[] = [];
  const online: CityCache['online'] = {};
  let minRx = Infinity;
  let maxRx = -Infinity;
  let minRy = Infinity;
  let maxRy = -Infinity;
  const syn = computeSynergies(city);
  applyMaxHp(city, syn);
  const bridges = findBridges(city);
  const bridgeCentres: CityCache['bridgeCentres'] = [];
  for (const t of city.tiles) {
    cells.set(cellId(t.gx, t.gy), t);
    const rx = t.gx * cell;
    const ry = t.gy * cell;
    centres.push({ tile: t, rx, ry });
    minRx = Math.min(minRx, rx);
    maxRx = Math.max(maxRx, rx);
    minRy = Math.min(minRy, ry);
    maxRy = Math.max(maxRy, ry);
    if (!t.online) continue;
    (online[t.type] ??= []).push(t);
    if (TILES[t.type].weapon) weapons.push(t);
    if (bridges.has(t.id)) bridgeCentres.push({ rx, ry });
  }
  if (centres.length === 0) minRx = maxRx = minRy = maxRy = 0;
  const mx = (minRx + maxRx) / 2;
  const my = (minRy + maxRy) / 2;
  let reach = 0;
  for (const c of centres) reach = Math.max(reach, Math.hypot(c.rx - mx, c.ry - my));
  return {
    online,
    reach,
    cells,
    centres,
    minRx,
    maxRx,
    minRy,
    maxRy,
    weapons,
    bridges,
    bridgeCentres,
    syn,
  };
}

/** World x of the left edge and y of the top edge of cell (0, 0); cell (gx, gy) starts gx/gy cells further. */
export function cellOrigin(w: World): { left: number; top: number } {
  const half = GRID.cellPx / 2;
  return { left: w.x - half, top: w.y - half };
}

export function tileAtCell(w: World, gx: number, gy: number): PlacedTile | undefined {
  return w.cache.cells.get(cellId(gx, gy));
}

export function tileCentre(w: World, t: PlacedTile): { x: number; y: number } {
  return { x: w.x + t.gx * GRID.cellPx, y: w.y + t.gy * GRID.cellPx };
}

/** World position of the centre of the city's occupied area. */
export function cityCentre(w: World): { x: number; y: number } {
  const c = w.cache;
  return { x: w.x + (c.minRx + c.maxRx) / 2, y: w.y + (c.minRy + c.maxRy) / 2 };
}
