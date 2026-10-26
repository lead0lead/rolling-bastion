/**
 * Adaptive pressure (concept-v2.md §2.14): while the city takes no damage,
 * pressure builds and more and tougher enemies arrive; being hit lets it
 * drain again. Starting values to tune by playing.
 */
export const PRESSURE = {
  /** The city counts as untouched once nothing was damaged for this long (s). */
  graceSec: 6,
  /** Pressure gained per second while untouched, and lost per second while being hit. */
  growthPerSec: 1 / 45,
  decayPerSec: 1 / 15,
  max: 4,
  /** Each point of pressure: spawn budget, enemy HP and enemy damage grow by this fraction. */
  budgetPerPoint: 0.2,
  hpPerPoint: 0.15,
  damagePerPoint: 0.1,
} as const;
