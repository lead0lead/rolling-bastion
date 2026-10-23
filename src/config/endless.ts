/**
 * Endless (concept-v2.md §2.11): after the boss the player may keep going.
 * Claude's draft numbers (outline agreed 2026-10-21), to tune by playing.
 */
export const ENDLESS = {
  /**
   * Enemy HP and contact/shot damage grow by this factor per minute past
   * the boss kill (compounding, on top of SPAWN.hpGrowthPerMinute).
   */
  growthPerMinute: 1.12,
  /** The Colossus returns every this many seconds after the boss kill. */
  bossEvery: 300,
  /** Each return multiplies the Colossus's HP by this (1.5, 2.25, …). */
  bossHpPerReturn: 1.5,
} as const;
