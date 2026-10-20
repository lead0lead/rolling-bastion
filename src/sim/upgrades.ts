import { UPGRADES } from '../config/balance';
import type { PieceDef } from '../config/pieces';
import { TILES, type PerkEffect, type PerkKind, type TileType } from '../config/tiles';
import type { CityState } from './grid';

/** Tile type levels and their perks (concept.md §2.8). */

/** Current level of a tile type (1 until upgraded). */
export function typeLevel(city: CityState, type: TileType): number {
  return Math.max(1, city.typeLevels[type]);
}

/** The type's active perk of the given kind (level 3 or 5 reached), if any. */
export function perk<K extends PerkKind>(
  city: CityState,
  type: TileType,
  kind: K,
): Extract<PerkEffect, { kind: K }> | undefined {
  const perks = TILES[type].perks;
  if (!perks) return undefined;
  const level = typeLevel(city, type);
  // The L5 perk wins when both levels give the same kind (Engine's size penalty).
  for (const [p, min] of [
    [perks.l5, 5],
    [perks.l3, 3],
  ] as const) {
    if (level >= min && p.effect.kind === kind) return p.effect as Extract<PerkEffect, { kind: K }>;
  }
  return undefined;
}

/** Weapon damage multiplier from the type level. */
export function levelDamage(city: CityState, type: TileType): number {
  return 1 + UPGRADES.damagePerLevel * (typeLevel(city, type) - 1);
}

/** Support effect multiplier from the type level. */
export function levelEffect(city: CityState, type: TileType): number {
  return 1 + UPGRADES.effectPerLevel * (typeLevel(city, type) - 1);
}

/** Max HP bonus (fraction) from the type level; only Hull and Plating gain HP. */
export function levelHpBonus(city: CityState, type: TileType): number {
  if (TILES[type].family !== 'structure') return 0;
  return UPGRADES.hpPerLevel * (typeLevel(city, type) - 1);
}

/**
 * The tile type an "Upgrade" on this piece would level: the type with the
 * most cells, preferring anything over Hull (a Cannon + 3 Hull piece
 * upgrades Cannons).
 */
export function upgradeType(def: PieceDef): TileType {
  const counts = new Map<TileType, number>();
  for (const c of def.cells) counts.set(c.tile, (counts.get(c.tile) ?? 0) + 1);
  let best: TileType = 'hull';
  let bestN = 0;
  for (const [type, n] of counts) {
    if (type === 'hull') continue;
    if (n > bestN) {
      best = type;
      bestN = n;
    }
  }
  return best;
}

/** True if the city owns a tile of this type and it is below the max level. */
export function canUpgrade(city: CityState, type: TileType): boolean {
  if (type === 'core') return false;
  if (typeLevel(city, type) >= UPGRADES.maxLevel) return false;
  return city.tiles.some((t) => t.type === type);
}

export function applyUpgrade(city: CityState, type: TileType): void {
  if (!canUpgrade(city, type)) return;
  city.typeLevels[type] = typeLevel(city, type) + 1;
}
