import { LINES, MOVE } from '../config/balance';
import {
  TILES,
  type BladeDef,
  type PulseDef,
  type TileType,
  type WeaponDef,
} from '../config/tiles';
import { cellId, type CityState, type PlacedTile } from './grid';
import { levelDamage, levelEffect, levelHpBonus, perk } from './upgrades';

/** Per-tile result of levels, adjacency buffs and chains (concept-v2.md §2.7). */
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
  /** Damage per second dealt to touching enemies (Plating L5). */
  thorns: number;
  /** Fraction of contact damage returned to the attacker. */
  reflect: number;
  /**
   * Bonus from the best chain the tile is in (0 = none): extra damage for a
   * weapon, a multiplier on its own effect for a Generator or Engine.
   */
  chainBonus: number;
}

/** A chain: identical online weapons or support tiles in a straight line, from (x0, y0) to (x1, y1). */
export interface Chain {
  type: TileType;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  length: number;
}

/** Neighbour buff types, in the fixed order buff pips are drawn (concept-v2.md §3.3). */
export const BUFF_TYPES = ['generator', 'shield', 'repair', 'hull'] as const;
export type BuffType = (typeof BUFF_TYPES)[number];

/**
 * One adjacency buff from an online support tile to a neighbour. `amount` is
 * the main effect before caps: fire rate fraction (Generator), damage taken
 * reduction (Shield), HP/s (Repair Bay), max HP fraction (Hull L3).
 */
export interface BuffLink {
  from: number;
  to: number;
  type: BuffType;
  amount: number;
}

/** A weapon type's stats with its perks applied. */
export interface WeaponStats extends WeaponDef {
  projectiles: number;
  pierce: number;
  shells: number;
  shellScatter: number;
  /** Multiplier on the burn this weapon sets (Flamethrower L5). */
  burnFactor: number;
}

/** A blade type's stats with its perks applied. */
export interface BladeStats extends BladeDef {
  count: number;
}

export interface Synergies {
  mods: Map<number, TileMods>;
  blades: Partial<Record<TileType, BladeStats>>;
  chains: Chain[];
  /** Every adjacency buff, in tile order of the source. */
  links: BuffLink[];
  weapons: Partial<Record<TileType, WeaponStats>>;
  /** Movement speed as a fraction of base. */
  speedFactor: number;
  /** Magnet pulse with levels and perks applied (the same for every Magnet). */
  magnetPulse: PulseDef;
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
  const grid = new Map<number, PlacedTile>();
  for (const t of city.tiles) grid.set(cellId(t.gx, t.gy), t);
  const at = (x: number, y: number) => grid.get(cellId(x, y));

  const acc = new Map<number, Acc>();
  for (const t of city.tiles) {
    acc.set(t.id, { fire: 0, genDamage: 0, shield: 0, heal: 0, hpBonus: 0, reflect: 0 });
  }
  const links: BuffLink[] = [];
  const around = (
    t: PlacedTile,
    diagonals: boolean,
    type: BuffType,
    amount: number,
    fn: (a: Acc) => void,
  ) => {
    for (const [dx, dy] of diagonals ? [...ORTHO, ...DIAG] : ORTHO) {
      const o = at(t.gx + dx, t.gy + dy);
      const a = o && acc.get(o.id);
      if (!a) continue;
      fn(a);
      links.push({ from: t.id, to: o.id, type, amount });
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
  let engines = 0;
  const { chains, chainBonus } = findChains(city, at);
  const own = (t: PlacedTile) => 1 + (chainBonus.get(t.id) ?? 0);

  for (const t of city.tiles) {
    if (!t.online) continue;
    switch (t.type) {
      case 'generator': {
        const fire = genAmount * own(t);
        around(t, false, 'generator', fire, (a) => {
          a.fire += fire;
          a.genDamage += genDamage;
        });
        break;
      }
      case 'shield':
        around(t, shieldDiag, 'shield', shieldAmount, (a) => {
          a.shield += shieldAmount;
          a.reflect = Math.max(a.reflect, reflect);
        });
        break;
      case 'repair':
        around(t, repairDiag, 'repair', repairAmount, (a) => (a.heal += repairAmount));
        break;
      case 'hull':
        if (hullBonus > 0) around(t, false, 'hull', hullBonus, (a) => (a.hpBonus += hullBonus));
        break;
      case 'engine':
        engines += own(t);
        break;
    }
  }

  const fireCap = perk(city, 'generator', 'raiseCap')?.cap ?? TILES.generator.support?.cap ?? 0;
  const shieldCap = TILES.shield.support?.cap ?? 0;
  const regen = perk(city, 'hull', 'regen')?.hpPerSec ?? 0;
  const platingThorns = perk(city, 'plating', 'thorns')?.dps ?? 0;

  const mods = new Map<number, TileMods>();
  for (const t of city.tiles) {
    const a = acc.get(t.id) as Acc;
    const def = TILES[t.type];
    const chain = def.family === 'weapon' ? (chainBonus.get(t.id) ?? 0) : 0;
    const fireRate = 1 + Math.min(a.fire, fireCap);
    const damage = levelDamage(city, t.type) * (1 + a.genDamage + chain);
    const thorns = t.online && t.type === 'plating' ? platingThorns : 0;
    mods.set(t.id, {
      damage,
      fireRate,
      damageTaken: 1 - Math.min(a.shield, shieldCap),
      contactTaken: perk(city, t.type, 'contactArmour')?.damageFactor ?? 1,
      heal: a.heal,
      regen: t.type === 'hull' ? regen : 0,
      maxHp: def.maxHp * (1 + levelHpBonus(city, t.type) + a.hpBonus),
      thorns,
      reflect: a.reflect,
      chainBonus: chainBonus.get(t.id) ?? 0,
    });
  }

  const sizePenalty = perk(city, 'engine', 'sizePenalty')?.factor ?? 1;
  const penalty =
    Math.max(0, city.tiles.length - MOVE.penaltyFreeTiles) * MOVE.penaltyPerTile * sizePenalty;
  const speedFactor =
    Math.max(MOVE.minSpeedFactor, 1 - penalty) +
    engines * MOVE.engineBonus * levelEffect(city, 'engine');

  const pulse = TILES.magnet.pulse as PulseDef;
  const magnetPulse: PulseDef = {
    intervalSec: perk(city, 'magnet', 'pulseInterval')?.sec ?? pulse.intervalSec,
    radius: (perk(city, 'magnet', 'pulseRadius')?.px ?? pulse.radius) * levelEffect(city, 'magnet'),
    gemSpeed: pulse.gemSpeed,
  };

  const weapons: Synergies['weapons'] = {};
  const blades: Synergies['blades'] = {};
  for (const type of Object.keys(TILES) as TileType[]) {
    const w = weaponStats(city, type);
    if (w) weapons[type] = w;
    const blade = TILES[type].blade;
    if (blade) {
      blades[type] = {
        ...blade,
        orbit: perk(city, type, 'bladeOrbit')?.px ?? blade.orbit,
        count: 1 + (perk(city, type, 'extraBlades')?.count ?? 0),
      };
    }
  }

  return {
    mods,
    blades,
    chains,
    links,
    weapons,
    speedFactor,
    magnetPulse,
    lowHpHealBoost: perk(city, 'repair', 'lowHpHealBoost'),
  };
}

/** Buffs one tile receives, per type: how many sources and their summed amount (before caps). */
export function buffsReceived(
  syn: Synergies,
  tileId: number,
): Partial<Record<BuffType, { count: number; total: number }>> {
  const out: Partial<Record<BuffType, { count: number; total: number }>> = {};
  for (const l of syn.links) {
    if (l.to !== tileId) continue;
    const r = (out[l.type] ??= { count: 0, total: 0 });
    r.count++;
    r.total += l.amount;
  }
  return out;
}

/** Chain bonus for a chain of `length` tiles (0 below LINES.chainMin). */
export function chainBonusFor(length: number): number {
  if (length < LINES.chainMin) return 0;
  return Math.min(LINES.chainMaxBonus, LINES.chainBonusStep * (length - LINES.chainMin + 1));
}

/** True if a tile type chains regardless of facing (no firing arc: Mortar, Saw, support tiles). */
function ignoresFacing(type: TileType): boolean {
  const w = TILES[type].weapon;
  return !w || w.arcDeg >= 360;
}

const SUPPORT_CHAINS: readonly TileType[] = LINES.supportChainTypes;

/** True if a tile type can form chains: weapons and the support types in LINES.supportChainTypes. */
export function chainsType(type: TileType): boolean {
  return TILES[type].family === 'weapon' || SUPPORT_CHAINS.includes(type);
}

/**
 * Chains (concept-v2.md §2.7): 3+ identical online weapon tiles in an
 * unbroken straight line, with the same facing unless the weapon has no arc;
 * Generators and Engines chain the same way, facing ignored.
 * A tile in a horizontal and a vertical chain keeps the higher bonus.
 */
function findChains(
  city: CityState,
  at: (x: number, y: number) => PlacedTile | undefined,
): { chains: Chain[]; chainBonus: Map<number, number> } {
  const chains: Chain[] = [];
  const chainBonus = new Map<number, number>();
  const links = (a: PlacedTile | undefined, b: PlacedTile | undefined) =>
    !!a && !!b && b.online && a.type === b.type && (a.facing === b.facing || ignoresFacing(a.type));
  const chainable = (t: PlacedTile | undefined) => !!t && t.online && chainsType(t.type);

  // The grid is open-ended: walk each run from its first tile (one whose
  // predecessor in the line doesn't link to it).
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ] as const) {
    for (const first of city.tiles) {
      if (!chainable(first)) continue;
      const prev = at(first.gx - dx, first.gy - dy);
      if (chainable(prev) && links(prev, first)) continue;
      const run = [first];
      let next = at(first.gx + dx, first.gy + dy);
      while (links(run[run.length - 1], next)) {
        run.push(next as PlacedTile);
        next = at(first.gx + dx * run.length, first.gy + dy * run.length);
      }
      const length = run.length;
      if (length < LINES.chainMin) continue;
      const bonus = chainBonusFor(length);
      for (const t of run) chainBonus.set(t.id, Math.max(chainBonus.get(t.id) ?? 0, bonus));
      const last = run[length - 1] as PlacedTile;
      chains.push({
        type: first.type,
        x0: first.gx,
        y0: first.gy,
        x1: last.gx,
        y1: last.gy,
        length,
      });
    }
  }
  // Stable order: horizontal chains by row then column, then vertical ones by column then row.
  const vertical = (c: Chain) => (c.x0 === c.x1 && c.y0 !== c.y1 ? 1 : 0);
  chains.sort((a, b) =>
    vertical(a) !== vertical(b)
      ? vertical(a) - vertical(b)
      : vertical(a)
        ? a.x0 - b.x0 || a.y0 - b.y0
        : a.y0 - b.y0 || a.x0 - b.x0,
  );
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
    range: perk(city, type, 'range')?.px ?? base.range,
    burnFactor: perk(city, type, 'burnFactor')?.factor ?? 1,
    blastRadius: perk(city, type, 'blastRadius')?.px ?? base.blastRadius,
    projectiles: 1 + (perk(city, type, 'extraProjectiles')?.count ?? 0),
    pierce: base.pierceAll ? Infinity : (perk(city, type, 'pierce')?.count ?? 0),
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
