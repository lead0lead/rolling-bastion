import type { TileType } from './tiles';

/**
 * Coins and the shop (concept-v2.md §2.13, §2.16). Kills pay coins straight
 * away; the shop (between rounds) sells pieces, land, upgrades and Core repairs. All numbers are
 * starting values to tune by playing.
 */
export const ECONOMY = {
  startCoins: 40,
  /** Coins per cell of each tile type: a piece costs the sum of its cells. */
  cost: {
    core: 0,
    hull: 10,
    crossbow: 45,
    flamethrower: 30,
    generator: 50,
    engine: 50,
    gatling: 30,
    tesla: 80,
    confetti: 30,
    blackhole: 300,
    hangar: 200,
    dome: 100,
    robot: 80,
  } satisfies Record<TileType, number>,
  /** Upgrading a type from level L costs this × the type's cell cost × L. */
  upgradePriceFactor: 3,
  /** Each level multiplies the next upgrade price by this: no level cap, just ever dearer. */
  upgradePriceGrowth: 1.1,
  /** Scrapping a placed piece pays back this fraction of its cost. */
  scrapRefund: 0.5,
  /** Repair Core heals `LEVEL_UP.repairCoreFraction` of the Core's max HP for this. */
  repairPrice: 25,
  /** Land (grid expansion): the n-th purchase (from 0) costs base + step × n. */
  land: { base: 50, step: 40 },
} as const;
