import { MOVE } from '../config/balance';
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
  const n = city.gridSize;
  const grid: (PlacedTile | undefined)[] = new Array(n * n);
  for (const t of city.tiles) grid[t.gy * n + t.gx] = t;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= n || y >= n ? undefined : grid[y * n + x];

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

  const mods = new Map<number, TileMods>();
  for (const t of city.tiles) {
    const a = acc.get(t.id) as Acc;
    const def = TILES[t.type];
    const fireRate = 1 + Math.min(a.fire, fireCap);
    const damage = levelDamage(city, t.type) * (1 + a.genDamage);
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
      maxHp: def.maxHp * (1 + levelHpBonus(city, t.type) + a.hpBonus),
      thorns,
      slow,
      reflect: a.reflect,
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
    weapons,
    speedFactor,
    pickupFactor: 1 + pickup,
    gemDrift: magnets > 0 ? perk(city, 'magnet', 'gemDrift') : undefined,
    gemPull: magnets > 0 ? perk(city, 'magnet', 'gemPull') : undefined,
    lowHpHealBoost: perk(city, 'repair', 'lowHpHealBoost'),
  };
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
