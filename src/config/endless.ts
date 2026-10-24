/**
 * Endless (concept-v2.md §2.11): after the boss the player may keep going,
 * round after round. Claude's draft numbers, to tune by playing.
 */
export const ENDLESS = {
  /** Enemy HP and contact/shot damage grow by this factor per round past the boss round (compounding). */
  growthPerRound: 1.1,
  /** The regular budget grows by this fraction of the boss round's per round past it. */
  budgetPerRound: 0.12,
  /** The Colossus returns every this many rounds after the boss round. */
  bossEvery: 4,
  /** Each return multiplies the Colossus's HP by this (1.5, 2.25, …). */
  bossHpPerReturn: 1.5,
} as const;
