export type TileType =
  | 'core'
  | 'hull'
  | 'plating'
  | 'gatling'
  | 'cannon'
  | 'mortar'
  | 'saw'
  | 'generator'
  | 'shield'
  | 'repair'
  | 'magnet'
  | 'engine';

export type TileFamily = 'core' | 'structure' | 'weapon' | 'support';

export interface WeaponDef {
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** Targeting range from the tile centre (px). */
  range: number;
  projectileSpeed: number;
  projectileRadius: number;
  /** Random aim spread, ± degrees. */
  spreadDeg: number;
  /** Knockback impulse on hit (px/s). */
  knockback: number;
}

export interface TileDef {
  name: string;
  family: TileFamily;
  maxHp: number;
  /** Fill colour (0xRRGGBB). Colour families per concept.md §6. */
  color: number;
  /** Short placeholder label drawn on the tile until real icons exist (Phase 5). */
  label: string;
  /** One-line function description shown in tooltips. */
  description: string;
  weapon?: WeaponDef;
}

export const TILES: Record<TileType, TileDef> = {
  core: {
    name: 'Core',
    family: 'core',
    maxHp: 250,
    color: 0xf4f6fb,
    label: '◆',
    description: 'Pistol: 8 dmg, 2 shots/s, range 200. Lose it and the run ends.',
    weapon: {
      damage: 8,
      fireRate: 2,
      range: 200,
      projectileSpeed: 520,
      projectileRadius: 3,
      spreadDeg: 0,
      knockback: 0,
    },
  },
  hull: {
    name: 'Hull',
    family: 'structure',
    maxHp: 40,
    color: 0x7b8494,
    label: '',
    description: 'No function. Connector, cheap armour.',
  },
  plating: {
    name: 'Plating',
    family: 'structure',
    maxHp: 120,
    color: 0x5f86b0,
    label: '▣',
    description: 'No function. Heavy armour for the edge.',
  },
  gatling: {
    name: 'Gatling',
    family: 'weapon',
    maxHp: 35,
    color: 0xf2b134,
    label: 'G',
    description: '4 dmg, 8 shots/s, range 220.',
    weapon: {
      damage: 4,
      fireRate: 8,
      range: 220,
      projectileSpeed: 620,
      projectileRadius: 2.5,
      spreadDeg: 4,
      knockback: 0,
    },
  },
  cannon: {
    name: 'Cannon',
    family: 'weapon',
    maxHp: 35,
    color: 0xf08a24,
    label: 'C',
    description: '30 dmg, 0.8 shots/s, range 300, knockback.',
    weapon: {
      damage: 30,
      fireRate: 0.8,
      range: 300,
      projectileSpeed: 460,
      projectileRadius: 5,
      spreadDeg: 0,
      knockback: 220,
    },
  },
  mortar: {
    name: 'Mortar',
    family: 'weapon',
    maxHp: 35,
    color: 0xe8692e,
    label: 'M',
    description: '20 dmg AoE r=48, 0.5 shots/s, range 80–350.',
  },
  saw: {
    name: 'Saw',
    family: 'weapon',
    maxHp: 60,
    color: 0xf5d04a,
    label: 'S',
    description: '25 dmg/s to touching enemies. Must be on the edge.',
  },
  generator: {
    name: 'Generator',
    family: 'support',
    maxHp: 30,
    color: 0x3ecf8e,
    label: '⚡',
    description: '+25% fire rate to neighbours (cap +75%).',
  },
  shield: {
    name: 'Shield Emitter',
    family: 'support',
    maxHp: 30,
    color: 0x2bb3b1,
    label: '◇',
    description: 'Neighbours take −40% damage (cap −60%).',
  },
  repair: {
    name: 'Repair Bay',
    family: 'support',
    maxHp: 30,
    color: 0x6fdc6f,
    label: '+',
    description: 'Heals neighbours 3 HP/s.',
  },
  magnet: {
    name: 'Magnet',
    family: 'support',
    maxHp: 30,
    color: 0x26a69a,
    label: 'U',
    description: '+30% pickup radius city-wide (cap +150%).',
  },
  engine: {
    name: 'Engine',
    family: 'support',
    maxHp: 30,
    color: 0x4fc3a1,
    label: '»',
    description: '+12% base speed.',
  },
};
