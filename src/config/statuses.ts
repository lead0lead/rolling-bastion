/** Enemy statuses that weapons apply and other weapons profit from (concept-v2.md §2.12). */
export type StatusType = 'burning' | 'snagged' | 'staggered' | 'marked';

export const STATUS = {
  /** Damage over time; the dps comes from the applying weapon (`WeaponDef.burnDps`). */
  burning: { duration: 3 },
  /** Slowed: movement speed × speedFactor. */
  snagged: { duration: 1, speedFactor: 0.6 },
  /** Stops moving (knockback still applies). */
  staggered: { duration: 0.4 },
  marked: { duration: 4 },
  /** Extra damage a weapon deals to an enemy with a status it profits from (once, not per status). */
  comboBonus: 0.5,
} as const;
