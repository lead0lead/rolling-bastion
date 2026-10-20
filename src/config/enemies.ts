export type EnemyType =
  'swarmer' | 'runner' | 'brute' | 'spitter' | 'sapper' | 'bomber' | 'colossus';

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
  /** XP gem value dropped on death. */
  xp: number;
  /** Collision radius (px). */
  radius: number;
  /** Spawn budget cost per enemy. */
  cost: number;
  /** Fill colour; enemies are dark with a bright outline (concept.md §6). */
  color: number;
  outline: number;
  ranged?: RangedDef;
  bomb?: BombDef;
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
    xp: 1,
    radius: 7,
    cost: 1,
    color: 0x3a0f2e,
    outline: 0xff3fa4,
  },
  runner: {
    name: 'Runner',
    maxHp: 6,
    speed: 140,
    contactDps: 4,
    xp: 1,
    radius: 6,
    cost: 0.8,
    color: 0x2a0b33,
    outline: 0xd77bff,
  },
  brute: {
    name: 'Brute',
    maxHp: 120,
    speed: 45,
    contactDps: 20,
    xp: 10,
    radius: 13,
    cost: 8,
    color: 0x33091c,
    outline: 0xff4f7b,
  },
  spitter: {
    name: 'Spitter',
    maxHp: 25,
    speed: 55,
    contactDps: 0,
    xp: 3,
    radius: 8,
    cost: 2.5,
    color: 0x2e0d24,
    outline: 0xff8a5c,
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
    color: 0x2b1a08,
    outline: 0xffd166,
    targetsBridges: true,
  },
  bomber: {
    name: 'Bomber',
    maxHp: 20,
    speed: 80,
    contactDps: 0,
    xp: 3,
    radius: 9,
    cost: 2.5,
    color: 0x3a0a0a,
    outline: 0xff4d4d,
    bomb: { damage: 40, radiusCells: 1 },
  },
  colossus: {
    name: 'Colossus (placeholder)',
    maxHp: 6000,
    speed: 35,
    contactDps: 60,
    xp: 0,
    radius: 36,
    cost: 0,
    color: 0x24061a,
    outline: 0xff2f6d,
    boss: true,
  },
};

export const ENEMY_TYPES = Object.keys(ENEMIES) as EnemyType[];

/**
 * Boss timing (concept.md §2.6, §4.1). Phase 3 placeholder: a big Brute that
 * summons Swarmer packs; the real Colossus phases come in Phase 4.
 */
export const BOSS = {
  type: 'colossus' as EnemyType,
  /** Spawns at this game time (s); regular spawns stop. */
  at: 720,
  /** Still alive at this time (s): enrages. */
  enrageAt: 840,
  /** Enraged contact damage multiplier (+100%). */
  enrageDamage: 2,
  /** Seconds between summoned Swarmer packs, and their size. */
  addInterval: 6,
  addCount: 5,
} as const;

/** Elites (concept.md §4.1): spawns above the enemy cap become one tougher enemy instead. */
export const ELITE = {
  /** Size multiplier. */
  scale: 1.4,
  /** Extra ring around elites (white, so it never reads as a Sapper's yellow). */
  outline: 0xffffff,
  /** Elites may exceed the soft cap by this many before spawns are skipped. */
  headroom: 60,
  /** An elite has the HP and XP of this many normal enemies (at least the group size). */
  minMultiplier: 4,
} as const;
