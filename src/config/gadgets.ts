/**
 * Numbers for the party update's gadgets (concept-v2.md §2.17): drones, dome,
 * repair robot and kill streaks.
 * Starting values to tune by playing.
 */
export const GADGETS = {
  hangar: {
    /** Drones per hangar, seconds between launches, flight speed (px/s), orbit radius (px). */
    maxDrones: 3,
    launchEvery: 6,
    speed: 230,
    orbit: 70,
    /** A drone hunts enemies within this reach of its hangar, and shoots from this close (px). */
    reach: 300,
    fireDist: 120,
    damage: 5,
    fireRate: 3,
    bulletSpeed: 480,
  },
  dome: {
    /** HP per emitter (× its level effect), px the dome reaches beyond the outermost tile. */
    hp: 150,
    margin: 16,
    /** Seconds without a hit before it recharges, and the share of max HP it regains per second. */
    regenAfter: 3,
    regenPerSec: 0.15,
    /** Seconds a broken dome stays down before it is back at full strength. */
    rebuild: 6,
    /** The break shockwave pushes enemies near the dome away (px/s) and hurts them. */
    push: 420,
    damage: 25,
  },
  robot: { hps: 8 },
  /** Kill streaks: a kill within `window` s of the last continues it; announcements at these streak lengths. */
  streak: {
    window: 1.5,
    tiers: [
      [10, 'Double!'],
      [25, 'Mega!'],
      [50, 'Ludicrous!'],
      [100, 'Monster!'],
      [200, 'Godlike!'],
    ],
  },
} as const;
