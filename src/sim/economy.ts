import { LEVEL_UP } from '../config/balance';
import { ECONOMY } from '../config/economy';
import type { PieceDef } from '../config/pieces';
import type { TileType } from '../config/tiles';
import { coreTile, type CityState } from './grid';
import { typeLevel } from './upgrades';

/** Shop prices (concept-v2.md §2.13). Pure functions of the config and the city. */

export function pieceCost(def: PieceDef): number {
  return def.cells.reduce((sum, c) => sum + ECONOMY.cost[c.tile], 0);
}

/** Coins paid back for scrapping these tiles. */
export function scrapValue(tiles: readonly { type: TileType }[]): number {
  return Math.round(tiles.reduce((sum, t) => sum + ECONOMY.cost[t.type], 0) * ECONOMY.scrapRefund);
}

/** Price of the next level of a tile type. */
export function upgradePrice(city: CityState, type: TileType): number {
  const level = typeLevel(city, type);
  return Math.round(
    ECONOMY.upgradePriceFactor * ECONOMY.cost[type] * level * ECONOMY.upgradePriceGrowth ** (level - 1),
  );
}

/** Price of the next land, given how many were bought before. */
export function landPrice(bought: number): number {
  return ECONOMY.land.base + ECONOMY.land.step * bought;
}

/** HP the Core would regain from a repair right now. */
export function repairAmount(city: CityState): number {
  const core = coreTile(city);
  if (!core) return 0;
  return Math.min(core.maxHp - core.hp, core.maxHp * LEVEL_UP.repairCoreFraction);
}
