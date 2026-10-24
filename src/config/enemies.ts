export type EnemyType =
  'swarmer' | 'runner' | 'brute' | 'juggernaut' | 'spitter' | 'sapper' | 'bomber' | 'colossus';

/** Keeps its distance and shoots the nearest tile (Spitter). */
export interface RangedDef {
  damage: number;
  /** Seconds between shots. */
  interval: number;
  /** Fires at tiles within this distance (px, to the tile centre). */
  range: number;
  /** Stops approaching once the nearest tile centre is this close (px). */
  keepDistance: number;
  shotSpeed: number;
  shotRadius: number;
}

/** Explodes on contact, damaging every tile in a square around the touched one, then dies (Bomber). */
export interface BombDef {
  damage: number;
  /** 1 = the touched tile and its 8 neighbours (3×3). */
  radiusCells: number;
}

export interface EnemyDef {
  name: string;
  maxHp: number;
  /** px/s */
  speed: number;
  /** Contact damage per second to the touched tile. */
  contactDps: number;
  /** Coins paid on death. */
  xp: number;
  /** Collision radius (px). */
  radius: number;
  /** Spawn budget cost per enemy. */
  cost: number;
  /**
   * Body colour, from one warm family (reds, pinks, purples) that never
   * mixes with the city's colours; the outline is a darker shade (concept.md §6).
   */
  color: number;
  ranged?: RangedDef;
  bomb?: BombDef;
  /** When killed it pops into `count` smaller enemies (balloons-TD style); elites and the boss don't. */
  split?: { into: EnemyType; count: number };
  /** Walks to the nearest bridge tile instead of the nearest tile (Sapper). */
  targetsBridges?: boolean;
  /**
   * The boss: one at a time, no HP growth over time, no knockback, and too big
   * for the spatial hash queries (handled separately).
   */
  boss?: boolean;
}

/** Enemies (concept.md §4.3). Starting values to tune. */
export const ENEMIES: Record<EnemyType, EnemyDef> = {
  swarmer: {
    name: 'Swarmer',
    maxHp: 10,
    speed: 60,
    contactDps: 5,
    xp: 2,
    radius: 7,
    cost: 1,
    color: 0xff5d73,
  },
  runner: {
    name: 'Runner',
    maxHp: 6,
    speed: 140,
    contactDps: 4,
    xp: 2,
    radius: 6,
    cost: 0.8,
    color: 0xc77dff,
  },
  brute: {
    name: 'Brute',
    maxHp: 120,
    speed: 45,
    contactDps: 20,
    xp: 10,
    radius: 13,
    cost: 8,
    color: 0xe63946,
    split: { into: 'swarmer', count: 3 },
  },
  juggernaut: {
    name: 'Juggernaut',
    maxHp: 600,
    speed: 38,
    contactDps: 45,
    xp: 30,
    radius: 20,
    cost: 30,
    color: 0x7b2cbf,
    split: { into: 'brute', count: 2 },
  },
  spitter: {
    name: 'Spitter',
    maxHp: 25,
    speed: 55,
    contactDps: 0,
    xp: 3,
    radius: 8,
    cost: 2.5,
    color: 0xff70a6,
    ranged: {
      damage: 8,
      interval: 2,
      range: 240,
      keepDistance: 190,
      shotSpeed: 220,
      shotRadius: 4,
    },
  },
  sapper: {
    name: 'Sapper',
    maxHp: 30,
    speed: 90,
    contactDps: 15,
    xp: 3,
    radius: 7,
    cost: 2.5,
    color: 0x9d4edd,
    targetsBridges: true,
  },
  bomber: {
    name: 'Bomber',
    maxHp: 20,
    speed: 80,
    contactDps: 0,
    xp: 5,
    radius: 9,
    cost: 2.5,
    color: 0xd62839,
    bomb: { damage: 40, radiusCells: 1 },
  },
  colossus: {
    name: 'Colossus',
    maxHp: 42000,
    speed: 35,
    contactDps: 60,
    xp: 200,
    radius: 36,
    cost: 0,
    color: 0xb5179e,
    boss: true,
  },
};

export const ENEMY_TYPES = Object.keys(ENEMIES) as EnemyType[];

/**
 * The Colossus (concept.md §4.3): timing and its three phases. Starting
 * values approved 2026-10-20.
 */
export const BOSS = {
  type: 'colossus' as EnemyType,
  /** Still alive this long (s) after its arrival: enrages. */
  enrageAfter: 120,
  /** Enraged contact damage multiplier (+100%). */
  enrageDamage: 2,
  /** HP fractions below which phase 2 and phase 3 start. */
  phaseAt: [0.65, 0.3],
  /** Swarmers summoned in a ring around the boss: seconds between rings per phase (0 = none), ring size. */
  addInterval: [6, 9, 0],
  addCount: 5,
  /** Phase 2+: fans of shots at the city. */
  volley: {
    interval: 4,
    count: 7,
    /** Total fan width (degrees). */
    spreadDeg: 60,
    damage: 8,
    speed: 220,
    /** Shots fly this far before fading (px). */
    range: 600,
  },
  /** Phase 3: telegraphed straight-line charges. */
  charge: {
    telegraph: 1,
    distance: 450,
    speed: 400,
    /** Contact damage multiplier while dashing. */
    damage: 3,
    /** Walks normally for this long between charges (s). */
    rest: 3,
  },
  /** Phase change shockwave: enemies within this radius of the city centre are pushed away. */
  shockwave: { radius: 320, push: 420 },
  /** How long the phase banner shows (s). */
  bannerSec: 2,
} as const;

/** Elites (concept.md §4.1): spawns above the enemy cap become one tougher enemy instead. */
export const ELITE = {
  /** Size multiplier. */
  scale: 1.4,
  /** Gold ring around elites. */
  ring: 0xffb703,
  /** Elites may exceed the soft cap by this many before spawns are skipped. */
  headroom: 60,
  /** An elite has the HP and XP of this many normal enemies (at least the group size). */
  minMultiplier: 4,
} as const;
