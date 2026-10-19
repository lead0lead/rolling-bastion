export type EnemyType = 'swarmer' | 'runner';

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
}

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
};

export const ENEMY_TYPES = Object.keys(ENEMIES) as EnemyType[];
