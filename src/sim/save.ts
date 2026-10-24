import type { CityState } from './grid';
import { createRng } from './rng';
import { cityChanged, createWorld, type World, type WeaponState } from './world';

/**
 * Saving a run (concept-v2.md §2.15): the world as JSON. Everything that can
 * be rebuilt (the city cache, the spatial hash, object pools, this tick's
 * events) is left out.
 */

/** Bump when the saved shape changes; older saves are then ignored. */
export const SAVE_VERSION = 2;

/** Keys of `World` that are not copied as they are. */
const SPECIAL = [
  'rng',
  'city',
  'cache',
  'hash',
  'enemyPool',
  'projectilePool',
  'enemyShotPool',
  'events',
  'weapons',
  'boss',
  'projectiles',
] as const;

interface SaveFile {
  version: number;
  /** The plain fields of the world. */
  world: Record<string, unknown>;
  rng: number;
  city: Omit<CityState, 'board'> & { board: number[] };
  weapons: [number, WeaponState][];
  /** Index of the live boss in `enemies`, or −1. */
  boss: number;
  /** Projectiles; the enemies a piercing shot already hit are forgotten. */
  projectiles: World['projectiles'];
}

/** JSON has no Infinity (enemy status timers start at −Infinity): store it as a marker. */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value) && !Number.isNaN(value)) {
    return { inf: Math.sign(value) };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'inf' in value) {
    const sign = (value as { inf: unknown }).inf;
    if (sign === 1 || sign === -1) return sign * Infinity;
  }
  return value;
}

export function saveWorld(w: World): string {
  const plain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(w)) {
    if (!(SPECIAL as readonly string[]).includes(key)) plain[key] = value;
  }
  const file: SaveFile = {
    version: SAVE_VERSION,
    world: plain,
    rng: w.rng.state(),
    city: { ...w.city, board: [...w.city.board] },
    weapons: [...w.weapons],
    boss: w.boss ? w.enemies.indexOf(w.boss) : -1,
    projectiles: w.projectiles.map((p) => ({ ...p, hits: [] })),
  };
  return JSON.stringify(file, replacer);
}

/** The world from a save, or null if the text is not a usable save of this version. */
export function loadWorld(json: string): World | null {
  try {
    const file = JSON.parse(json, reviver) as SaveFile;
    if (file.version !== SAVE_VERSION) return null;
    const w = createWorld(0);
    Object.assign(w, file.world);
    w.rng = createRng(0);
    w.rng.setState(file.rng);
    w.city = { ...file.city, board: new Set(file.city.board) };
    w.weapons = new Map(file.weapons);
    w.projectiles = file.projectiles;
    w.boss = file.boss >= 0 ? (w.enemies[file.boss] ?? null) : null;
    if (!Array.isArray(w.enemies) || w.city.tiles.length === 0) return null;
    cityChanged(w);
    return w;
  } catch {
    return null;
  }
}
