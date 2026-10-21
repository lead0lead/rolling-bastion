/**
 * Spike A (concept-v2.md §2.8): coins, prices and the shop. All numbers are
 * Claude's first guesses, to be calibrated with the user.
 */
export const ECONOMY = {
  /** Coins at the start of a run. */
  startCoins: 0,
  /** `?sandbox=1`: the shop opens at once with this many coins. */
  sandboxCoins: 9999,
  /** Coins still on the ground when a wave ends are collected at this share (rounded down). */
  leftoverShare: 0.5,
  /** Prices × (1 + inflationPerWave × (wave − 1)), rounded; `wave` = the wave just cleared. */
  inflationPerWave: 0.2,
  /** Piece price: per Hull/Plating cell, and per other cell. */
  pieceCellCheap: 1,
  pieceCell: 3,
  /** Upgrade price: this × the level bought. */
  upgradePerLevel: 8,
  repairCore: 10,
  /** Reroll: base price, +step per reroll within the same shop visit. */
  rerollBase: 2,
  rerollStep: 1,
  /** Scrapping refunds this share of the price paid (rounded down). */
  scrapRefund: 0.5,
  pieceSlots: 4,
  upgradeSlots: 2,
} as const;

/** Spike A wave plan (concept-v2.md §2.8). */
export const WAVE_PLAN = {
  /** Normal waves; the boss wave is `count + 1`. */
  count: 15,
  /** Wave n lasts firstSec + stepSec × (n − 1) seconds. */
  firstSec: 25,
  stepSec: 2.5,
  /**
   * The v1 spawner runs on a "v1 clock": wave starts map to these v1 times
   * (interpolated in between), so new enemy types, the 40-Swarmer spike, the
   * Elite Brute, pentominoes and the final escalation arrive at the waves
   * listed in concept-v2.md §2.8. Pairs of [wave, v1 time (s)].
   */
  v1Clock: [
    [1, 0],
    [2, 60],
    [4, 150],
    [6, 240],
    [8, 330],
    [10, 420],
    [13, 600],
    [16, 720],
  ] as [wave: number, v1Time: number][],
  /** Spike A only: the grid grows by one ring in the shops after these waves. */
  expandAfter: [6, 10],
  /** The boss enrages this long after it arrives (s). */
  bossEnrageAfter: 120,
  /** "WAVE n CLEARED" shows this long before the shop opens (ms); enemies fade meanwhile. */
  clearedBannerMs: 1000,
  /** "WAVE n" banner at the start of a wave (s). */
  startBannerSec: 1.5,
} as const;

/** Spike A coin value of the Elite Brute (replaces "3 level-ups of XP"). */
export const ELITE_BRUTE_COINS = 40;
