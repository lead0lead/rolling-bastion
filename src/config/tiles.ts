import type { StatusType } from './statuses';

export type TileType =
  | 'core'
  | 'hull'
  | 'gatling'
  | 'cannon'
  | 'mortar'
  | 'crossbow'
  | 'flamethrower'
  | 'generator'
  | 'shield'
  | 'repair'
  | 'engine';

/** Compass facing in quarter turns clockwise from up: 0 up, 1 right, 2 down, 3 left. */
export type Facing = 0 | 1 | 2 | 3;

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
  /** Firing arc in degrees, centred on the tile's facing; 360 = all around (concept.md §2.10). */
  arcDeg: number;
  /** Targets closer than this are ignored (px). */
  minRange?: number;
  /** Lobbed shells: fly to the target point and damage every enemy within this radius there. */
  blastRadius?: number;
  /** Aim where the target will be when the shot arrives (from its current velocity). */
  leadsTarget?: boolean;
  /**
   * Flame cone: instead of a projectile, each shot hits every enemy within
   * `range` and this many degrees of the aim direction (full cone width).
   */
  coneDeg?: number;
  /** Targets the live enemy with the most HP in range instead of the nearest. */
  targetsStrongest?: boolean;
  /** Targets the enemy with the most others inside the blast radius (needs `blastRadius`). */
  targetsDensest?: boolean;
}

/** How a weapon tile takes part in status combos (concept-v2.md §2.12). */
export interface ComboDef {
  /** Status put on every enemy this tile's attacks hit. */
  applies?: StatusType;
  /** Statuses that make this tile's hits deal STATUS.comboBonus more damage. */
  profitsFrom?: readonly StatusType[];
  /** Burn damage per second for `applies: 'burning'`, at damage multiplier 1. */
  burnDps?: number;
}

/** Support tile effect at level 1; grows per level (UPGRADES.effectPerLevel). */
export interface SupportDef {
  amount: number;
  /** Cap on the summed effect of this type on one tile. */
  cap?: number;
}

/** What a level 3 / level 5 perk does (concept.md §2.8). Applies to the whole tile type. */
export type PerkEffect =
  | { kind: 'extraProjectiles'; count: number }
  | { kind: 'arc'; deg: number }
  | { kind: 'pierce'; count: number }
  | { kind: 'blastRadius'; px: number }
  | { kind: 'shells'; count: number; scatterPx: number }
  | { kind: 'contactArmour'; damageFactor: number }
  | { kind: 'neighbourDamage'; bonus: number }
  | { kind: 'raiseCap'; cap: number }
  | { kind: 'diagonals' }
  | { kind: 'reflect'; fraction: number }
  | { kind: 'lowHpHealBoost'; belowFrac: number; factor: number }
  | { kind: 'sizePenalty'; factor: number }
  | { kind: 'neighbourHp'; bonus: number }
  | { kind: 'regen'; hpPerSec: number }
  | { kind: 'range'; px: number }
  | { kind: 'burnFactor'; factor: number };

export type PerkKind = PerkEffect['kind'];

export interface PerkDef {
  name: string;
  effect: PerkEffect;
}

export interface TileDef {
  name: string;
  family: TileFamily;
  maxHp: number;
  /** Fill colour (0xRRGGBB); the outline is a darker shade. Colour families per concept.md §6. */
  color: number;
  /** Short placeholder label drawn on the tile until real icons exist (Phase 5). */
  label: string;
  /** One-line function description shown in tooltips. */
  description: string;
  weapon?: WeaponDef;
  support?: SupportDef;
  combo?: ComboDef;
  /** Named perks unlocked at type level 3 and 5. */
  perks?: { l3: PerkDef; l5: PerkDef };
}

export const TILES: Record<TileType, TileDef> = {
  core: {
    name: 'Core',
    family: 'core',
    maxHp: 250,
    color: 0xffffff,
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
      arcDeg: 360,
    },
  },
  hull: {
    name: 'Hull',
    family: 'structure',
    maxHp: 40,
    color: 0xa9b4c6,
    label: '',
    description: 'No function. Connector, cheap armour.',
    perks: {
      l3: {
        name: 'Bracing: +10% max HP to neighbours',
        effect: { kind: 'neighbourHp', bonus: 0.1 },
      },
      l5: { name: 'Self-repair: regenerates 1 HP/s', effect: { kind: 'regen', hpPerSec: 1 } },
    },
  },
  gatling: {
    name: 'Gatling',
    family: 'weapon',
    maxHp: 35,
    color: 0xffc933,
    label: 'G',
    description: '4 dmg, 8 shots/s, range 270, fires in a 180° arc.',
    weapon: {
      damage: 4,
      fireRate: 8,
      range: 270,
      projectileSpeed: 620,
      projectileRadius: 2.5,
      spreadDeg: 4,
      knockback: 0,
      arcDeg: 180,
    },
    combo: { profitsFrom: ['burning'] },
    perks: {
      l3: {
        name: 'Twin feed: +1 projectile per shot',
        effect: { kind: 'extraProjectiles', count: 1 },
      },
      l5: { name: 'Swivel mount: arc 180° → 270°', effect: { kind: 'arc', deg: 270 } },
    },
  },
  cannon: {
    name: 'Cannon',
    family: 'weapon',
    maxHp: 35,
    color: 0xff9933,
    label: 'C',
    description: '45 dmg, 1.2 shots/s, range 380, fires in a 90° arc, knockback.',
    weapon: {
      damage: 45,
      fireRate: 1.2,
      range: 380,
      projectileSpeed: 460,
      projectileRadius: 5,
      spreadDeg: 0,
      knockback: 220,
      arcDeg: 90,
    },
    combo: { applies: 'staggered', profitsFrom: ['snagged'] },
    perks: {
      l3: { name: 'Wide traverse: arc 90° → 135°', effect: { kind: 'arc', deg: 135 } },
      l5: { name: 'Sabot: shots pierce 3 enemies', effect: { kind: 'pierce', count: 3 } },
    },
  },
  mortar: {
    name: 'Mortar',
    family: 'weapon',
    maxHp: 35,
    color: 0xf2762e,
    label: 'M',
    description:
      '30 dmg in a 64 px blast, 0.5 shots/s, range 80–350, all directions; aims ahead at Bombers first, then the densest group.',
    weapon: {
      damage: 30,
      fireRate: 0.5,
      range: 350,
      minRange: 80,
      blastRadius: 64,
      targetsDensest: true,
      leadsTarget: true,
      projectileSpeed: 420,
      projectileRadius: 4,
      spreadDeg: 0,
      knockback: 0,
      arcDeg: 360,
    },
    combo: { applies: 'staggered', profitsFrom: ['snagged'] },
    perks: {
      l3: { name: 'Heavy shells: blast radius 64 → 96', effect: { kind: 'blastRadius', px: 96 } },
      l5: {
        name: 'Salvo: 3 scattered shells per shot',
        effect: { kind: 'shells', count: 3, scatterPx: 40 },
      },
    },
  },
  crossbow: {
    name: 'Crossbow',
    family: 'weapon',
    maxHp: 35,
    color: 0xe0a43a,
    label: 'X',
    description:
      'Shoots Bombers first, then the toughest enemy in range: 120 dmg bolt, 0.6 shots/s, range 520, all directions.',
    weapon: {
      damage: 120,
      fireRate: 0.6,
      range: 520,
      projectileSpeed: 800,
      projectileRadius: 4,
      spreadDeg: 0,
      knockback: 0,
      arcDeg: 360,
      targetsStrongest: true,
    },
    combo: { profitsFrom: ['staggered'] },
    perks: {
      l3: { name: 'Twin string: +1 bolt per shot', effect: { kind: 'extraProjectiles', count: 1 } },
      l5: { name: 'Heavy bolts: pierce 3 enemies', effect: { kind: 'pierce', count: 3 } },
    },
  },
  flamethrower: {
    name: 'Flamethrower',
    family: 'weapon',
    maxHp: 60,
    color: 0xff5e3a,
    label: 'F',
    description:
      'Sprays a 60° cone 96 px out: 3 dmg × 10/s to all in it, and they burn 8 dmg/s for 3 s.',
    weapon: {
      damage: 3,
      fireRate: 10,
      range: 96,
      projectileSpeed: 0,
      projectileRadius: 0,
      spreadDeg: 0,
      knockback: 0,
      arcDeg: 180,
      coneDeg: 60,
    },
    combo: { applies: 'burning', profitsFrom: ['snagged'], burnDps: 8 },
    perks: {
      l3: { name: 'Long nozzle: reach 96 → 128 px', effect: { kind: 'range', px: 128 } },
      l5: { name: 'Napalm: burn damage ×2', effect: { kind: 'burnFactor', factor: 2 } },
    },
  },
  generator: {
    name: 'Generator',
    family: 'support',
    maxHp: 30,
    color: 0x3ddc84,
    label: '⚡',
    description: '+25% fire rate to neighbours (cap +75%).',
    support: { amount: 0.25, cap: 0.75 },
    perks: {
      l3: {
        name: 'Overcharge: neighbours +15% damage',
        effect: { kind: 'neighbourDamage', bonus: 0.15 },
      },
      l5: { name: 'Surge: fire rate cap +75% → +125%', effect: { kind: 'raiseCap', cap: 1.25 } },
    },
  },
  shield: {
    name: 'Shield Emitter',
    family: 'support',
    maxHp: 30,
    color: 0x2ec4d6,
    label: '◇',
    description: 'Neighbours take −40% damage (cap −60%).',
    support: { amount: 0.4, cap: 0.6 },
    perks: {
      l3: { name: 'Wide field: also covers diagonal neighbours', effect: { kind: 'diagonals' } },
      l5: {
        name: 'Feedback: shielded tiles return 25% of contact damage',
        effect: { kind: 'reflect', fraction: 0.25 },
      },
    },
  },
  repair: {
    name: 'Repair Bay',
    family: 'support',
    maxHp: 30,
    color: 0x86e05a,
    label: '+',
    description: 'Heals neighbours 3 HP/s.',
    support: { amount: 3 },
    perks: {
      l3: { name: 'Drones: also heals diagonal neighbours', effect: { kind: 'diagonals' } },
      l5: {
        name: 'Triage: double healing on tiles below 50% HP',
        effect: { kind: 'lowHpHealBoost', belowFrac: 0.5, factor: 2 },
      },
    },
  },
  engine: {
    name: 'Engine',
    family: 'support',
    maxHp: 30,
    color: 0x5ad1b0,
    label: '»',
    description: '+12% base speed.',
    perks: {
      l3: {
        name: 'Gearbox: size speed penalty halved',
        effect: { kind: 'sizePenalty', factor: 0.5 },
      },
      l5: { name: 'Overdrive: no size speed penalty', effect: { kind: 'sizePenalty', factor: 0 } },
    },
  },
};
