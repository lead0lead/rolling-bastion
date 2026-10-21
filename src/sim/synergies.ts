import { LINES, MOVE } from '../config/balance';
import { TILES, type TileType, type WeaponDef } from '../config/tiles';
import type { CityState, PlacedTile } from './grid';
import { levelDamage, levelEffect, levelHpBonus, perk } from './upgrades';

/** Per-tile result of levels, adjacency buffs, chains and filled lines (concept.md §2.7). */
export interface TileMods {
  /** Weapon damage multiplier. */
  damage: number;
  /** Fire rate multiplier (also the Saw's spin). */
  fireRate: number;
  /** Multiplier on all damage taken (Shield Emitters). */
  damageTaken: number;
  /** Extra multiplier on contact damage taken (Plating L3, Saw L5). */
  contactTaken: number;
  /** HP/s from Repair Bays. */
  heal: number;
  /** HP/s the tile regenerates by itself (Hull L5). */
  regen: number;
  maxHp: number;
  /** Damage per second dealt to touching enemies (Saw, Plating L5). */
  thorns: number;
  /** Speed factor for touching enemies (1 = no slow). */
  slow: number;
  /** Fraction of contact damage returned to the attacker. */
  reflect: number;
  /** Damage bonus from the best weapon chain the tile is in (0 = none). */
  chainBonus: number;
  /** Number of filled rows/columns the tile is in (0–2). */
  fills: number;
}

/** A weapon chain: identical online weapons in a straight line, from (x0, y0) to (x1, y1). */
export interface Chain {
  type: TileType;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  length: number;
}

/** A weapon type's stats with its perks applied. */
export interface WeaponStats extends WeaponDef {
  projectiles: number;
  pierce: number;
  shells: number;
  shellScatter: number;
}

export interface Synergies {
  mods: Map<number, TileMods>;
  chains: Chain[];
  /** Indexes of rows / columns completely filled with online tiles. */
  filledRows: number[];
  filledCols: number[];
  weapons: Partial<Record<TileType, WeaponStats>>;
  /** Movement speed as a fraction of base. */
  speedFactor: number;
  /** Gem pickup radius multiplier. */
  pickupFactor: number;
  gemDrift?: { radiusFactor: number; speed: number };
  gemPull?: { intervalSec: number; speed: number };
  lowHpHealBoost?: { belowFrac: number; factor: number };
}

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Accumulated raw buffs before caps. */
interface Acc {
  fire: number;
  genDamage: number;
  shield: number;
  heal: number;
  hpBonus: number;
  reflect: number;
}

/**
 * Derives every tile's modifiers from the city. Pure; cheap enough to run on
 * every city change (≤100 tiles). Only online tiles give buffs.
 */
export function computeSynergies(city: CityState): Synergies {
  // Spike B: sparse lookup on the unbounded grid.
  const grid = new Map<string, PlacedTile>();
  for (const t of city.tiles) grid.set(`${t.gx},${t.gy}`, t);
  const at = (x: number, y: number) => grid.get(`${x},${y}`);

  const acc = new Map<number, Acc>();
  for (const t of city.tiles) {
    acc.set(t.id, { fire: 0, genDamage: 0, shield: 0, heal: 0, hpBonus: 0, reflect: 0 });
  }
  const around = (t: PlacedTile, diagonals: boolean, fn: (a: Acc) => void) => {
    for (const [dx, dy] of diagonals ? [...ORTHO, ...DIAG] : ORTHO) {
      const o = at(t.gx + dx, t.gy + dy);
      const a = o && acc.get(o.id);
      if (a) fn(a);
    }
  };

  const genAmount = (TILES.generator.support?.amount ?? 0) * levelEffect(city, 'generator');
  const genDamage = perk(city, 'generator', 'neighbourDamage')?.bonus ?? 0;
  const shieldAmount = (TILES.shield.support?.amount ?? 0) * levelEffect(city, 'shield');
  const shieldDiag = !!perk(city, 'shield', 'diagonals');
  const reflect = perk(city, 'shield', 'reflect')?.fraction ?? 0;
  const repairAmount = (TILES.repair.support?.amount ?? 0) * levelEffect(city, 'repair');
  const repairDiag = !!perk(city, 'repair', 'diagonals');
  const hullBonus = perk(city, 'hull', 'neighbourHp')?.bonus ?? 0;
  let magnets = 0;
  let engines = 0;

  for (const t of city.tiles) {
    if (!t.online) continue;
    switch (t.type) {
      case 'generator':
        around(t, false, (a) => {
          a.fire += genAmount;
          a.genDamage += genDamage;
        });
        break;
      case 'shield':
        around(t, shieldDiag, (a) => {
          a.shield += shieldAmount;
          a.reflect = Math.max(a.reflect, reflect);
        });
        break;
      case 'repair':
        around(t, repairDiag, (a) => (a.heal += repairAmount));
        break;
      case 'hull':
        if (hullBonus > 0) around(t, false, (a) => (a.hpBonus += hullBonus));
        break;
      case 'magnet':
        magnets++;
        break;
      case 'engine':
        engines++;
        break;
    }
  }

  const fireCap = perk(city, 'generator', 'raiseCap')?.cap ?? TILES.generator.support?.cap ?? 0;
  const shieldCap = TILES.shield.support?.cap ?? 0;
  const regen = perk(city, 'hull', 'regen')?.hpPerSec ?? 0;
  const platingThorns = perk(city, 'plating', 'thorns')?.dps ?? 0;
  const sawSlow = perk(city, 'saw', 'slowTouching')?.speedFactor ?? 1;

  const { chains, chainBonus } = findChains(city, at);
  // Spike B: filled rows/columns are removed (concept-v2.md §2.7).
  const filledRows: number[] = [];
  const filledCols: number[] = [];

  const mods = new Map<number, TileMods>();
  for (const t of city.tiles) {
    const a = acc.get(t.id) as Acc;
    const def = TILES[t.type];
    const fills = Math.min(
      LINES.maxFills,
      (filledRows.includes(t.gy) ? 1 : 0) + (filledCols.includes(t.gx) ? 1 : 0),
    );
    const fill = fills * LINES.fillBonus;
    const chain = chainBonus.get(t.id) ?? 0;
    const fireRate = 1 + Math.min(a.fire, fireCap);
    const damage = levelDamage(city, t.type) * (1 + a.genDamage + chain + fill);
    let thorns = 0;
    let slow = 1;
    if (t.online && def.contactDps) {
      thorns = def.contactDps * damage * fireRate;
      slow = sawSlow;
    }
    if (t.online && t.type === 'plating') thorns += platingThorns;
    mods.set(t.id, {
      damage,
      fireRate,
      damageTaken: 1 - Math.min(a.shield, shieldCap),
      contactTaken: perk(city, t.type, 'contactArmour')?.damageFactor ?? 1,
      heal: a.heal,
      regen: t.type === 'hull' ? regen : 0,
      maxHp: def.maxHp * (1 + levelHpBonus(city, t.type) + a.hpBonus + fill),
      thorns,
      slow,
      reflect: a.reflect,
      chainBonus: chain,
      fills,
    });
  }

  const sizePenalty = perk(city, 'engine', 'sizePenalty')?.factor ?? 1;
  const penalty =
    Math.max(0, city.tiles.length - MOVE.penaltyFreeTiles) * MOVE.penaltyPerTile * sizePenalty;
  const speedFactor =
    Math.max(MOVE.minSpeedFactor, 1 - penalty) +
    engines * MOVE.engineBonus * levelEffect(city, 'engine');

  const magnetDef = TILES.magnet.support;
  const pickup = Math.min(
    magnets * (magnetDef?.amount ?? 0) * levelEffect(city, 'magnet'),
    magnetDef?.cap ?? 0,
  );

  const weapons: Synergies['weapons'] = {};
  for (const type of Object.keys(TILES) as TileType[]) {
    const w = weaponStats(city, type);
    if (w) weapons[type] = w;
  }

  return {
    mods,
    chains,
    filledRows,
    filledCols,
    weapons,
    speedFactor,
    pickupFactor: 1 + pickup,
    gemDrift: magnets > 0 ? perk(city, 'magnet', 'gemDrift') : undefined,
    gemPull: magnets > 0 ? perk(city, 'magnet', 'gemPull') : undefined,
    lowHpHealBoost: perk(city, 'repair', 'lowHpHealBoost'),
  };
}

/** True if a weapon type chains regardless of facing (no firing arc: Mortar, Saw). */
function ignoresFacing(type: TileType): boolean {
  const w = TILES[type].weapon;
  return !w || w.arcDeg >= 360;
}

/**
 * Weapon chains (concept.md §2.7): 3+ identical online weapon tiles in an
 * unbroken straight line, with the same facing unless the weapon has no arc.
 * A tile in a horizontal and a vertical chain keeps the higher bonus.
 */
function findChains(
  city: CityState,
  at: (x: number, y: number) => PlacedTile | undefined,
): { chains: Chain[]; chainBonus: Map<number, number> } {
  // Spike B: scan the city's bounding box instead of a fixed grid.
  const xs = city.tiles.map((t) => t.gx);
  const ys = city.tiles.map((t) => t.gy);
  const minX = Math.min(0, ...xs);
  const minY = Math.min(0, ...ys);
  const maxX = Math.max(0, ...xs);
  const maxY = Math.max(0, ...ys);
  const chains: Chain[] = [];
  const chainBonus = new Map<number, number>();
  const links = (a: PlacedTile | undefined, b: PlacedTile | undefined) =>
    !!a && !!b && b.online && a.type === b.type && (a.facing === b.facing || ignoresFacing(a.type));
  const chainable = (t: PlacedTile | undefined) =>
    !!t && t.online && TILES[t.type].family === 'weapon';

  for (const horizontal of [true, false]) {
    const [lineMin, lineMax] = horizontal ? [minY, maxY] : [minX, maxX];
    const [from, n] = horizontal ? [minX, maxX + 1] : [minY, maxY + 1];
    for (let line = lineMin; line <= lineMax; line++) {
      const cell = (i: number) => (horizontal ? at(i, line) : at(line, i));
      let start = from;
      while (start < n) {
        const first = cell(start);
        if (!chainable(first)) {
          start++;
          continue;
        }
        let end = start;
        while (end + 1 < n && links(cell(end), cell(end + 1))) end++;
        const length = end - start + 1;
        if (length >= LINES.chainMin && first) {
          const bonus = Math.min(
            LINES.chainMaxBonus,
            LINES.chainBonusStep * (length - LINES.chainMin + 1),
          );
          for (let i = start; i <= end; i++) {
            const t = cell(i) as PlacedTile;
            chainBonus.set(t.id, Math.max(chainBonus.get(t.id) ?? 0, bonus));
          }
          chains.push(
            horizontal
              ? { type: first.type, x0: start, y0: line, x1: end, y1: line, length }
              : { type: first.type, x0: line, y0: start, x1: line, y1: end, length },
          );
        }
        start = end + 1;
      }
    }
  }
  return { chains, chainBonus };
}

/** A weapon type's stats with its active perks applied. */
export function weaponStats(city: CityState, type: TileType): WeaponStats | undefined {
  const base = TILES[type].weapon;
  if (!base) return undefined;
  const shells = perk(city, type, 'shells');
  return {
    ...base,
    arcDeg: perk(city, type, 'arc')?.deg ?? base.arcDeg,
    blastRadius: perk(city, type, 'blastRadius')?.px ?? base.blastRadius,
    projectiles: 1 + (perk(city, type, 'extraProjectiles')?.count ?? 0),
    pierce: perk(city, type, 'pierce')?.count ?? 0,
    shells: shells?.count ?? 1,
    shellScatter: shells?.scatterPx ?? 0,
  };
}

/**
 * Sets each tile's max HP from its modifiers. A higher max adds the
 * difference as HP; a lower max clamps HP.
 */
export function applyMaxHp(city: CityState, syn: Synergies): void {
  for (const t of city.tiles) {
    const max = syn.mods.get(t.id)?.maxHp ?? TILES[t.type].maxHp;
    if (max === t.maxHp) continue;
    if (max > t.maxHp) t.hp += max - t.maxHp;
    t.maxHp = max;
    t.hp = Math.min(t.hp, max);
  }
}
